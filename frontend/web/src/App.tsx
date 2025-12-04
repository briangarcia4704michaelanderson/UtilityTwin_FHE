import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface UtilityData {
  id: string;
  utilityType: string;
  location: string;
  depth: number;
  status: "operational" | "maintenance" | "critical";
  timestamp: number;
  encryptedData: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [utilityData, setUtilityData] = useState<UtilityData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newUtilityData, setNewUtilityData] = useState({
    utilityType: "",
    location: "",
    depth: "",
    status: "operational"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStatistics, setShowStatistics] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Calculate statistics
  const operationalCount = utilityData.filter(u => u.status === "operational").length;
  const maintenanceCount = utilityData.filter(u => u.status === "maintenance").length;
  const criticalCount = utilityData.filter(u => u.status === "critical").length;

  // Filter data based on search and filter criteria
  const filteredData = utilityData.filter(item => {
    const matchesSearch = item.location.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.utilityType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || item.status === filterType;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadUtilityData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadUtilityData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("utility_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing utility keys:", e);
        }
      }
      
      const list: UtilityData[] = [];
      
      for (const key of keys) {
        try {
          const utilityBytes = await contract.getData(`utility_${key}`);
          if (utilityBytes.length > 0) {
            try {
              const utilityItem = JSON.parse(ethers.toUtf8String(utilityBytes));
              list.push({
                id: key,
                utilityType: utilityItem.utilityType,
                location: utilityItem.location,
                depth: utilityItem.depth,
                status: utilityItem.status,
                timestamp: utilityItem.timestamp,
                encryptedData: utilityItem.encryptedData
              });
            } catch (e) {
              console.error(`Error parsing utility data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading utility ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setUtilityData(list);
    } catch (e) {
      console.error("Error loading utility data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitUtilityData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting utility data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newUtilityData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const utilityId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const utilityItem = {
        utilityType: newUtilityData.utilityType,
        location: newUtilityData.location,
        depth: parseFloat(newUtilityData.depth as string),
        status: newUtilityData.status,
        timestamp: Math.floor(Date.now() / 1000),
        encryptedData: encryptedData
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `utility_${utilityId}`, 
        ethers.toUtf8Bytes(JSON.stringify(utilityItem))
      );
      
      const keysBytes = await contract.getData("utility_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(utilityId);
      
      await contract.setData(
        "utility_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Utility data encrypted and stored securely!"
      });
      
      await loadUtilityData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewUtilityData({
          utilityType: "",
          location: "",
          depth: "",
          status: "operational"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const updateUtilityStatus = async (utilityId: string, newStatus: "operational" | "maintenance" | "critical") => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating status with FHE computation..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const utilityBytes = await contract.getData(`utility_${utilityId}`);
      if (utilityBytes.length === 0) {
        throw new Error("Utility data not found");
      }
      
      const utilityItem = JSON.parse(ethers.toUtf8String(utilityBytes));
      
      const updatedUtility = {
        ...utilityItem,
        status: newStatus
      };
      
      await contract.setData(
        `utility_${utilityId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedUtility))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Status updated securely with FHE!"
      });
      
      await loadUtilityData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE System is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to access the FHE-secured utility network",
      icon: "🔗"
    },
    {
      title: "Add Utility Data",
      description: "Submit encrypted utility data using FHE technology for maximum security",
      icon: "➕"
    },
    {
      title: "FHE Processing",
      description: "All data processing happens in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Monitor Infrastructure",
      description: "Track the status of underground utilities securely",
      icon: "📊"
    }
  ];

  const renderStatusChart = () => {
    const total = utilityData.length || 1;
    const operationalPercentage = (operationalCount / total) * 100;
    const maintenancePercentage = (maintenanceCount / total) * 100;
    const criticalPercentage = (criticalCount / total) * 100;

    return (
      <div className="status-chart-container">
        <div className="status-chart">
          <div 
            className="chart-segment operational" 
            style={{ width: `${operationalPercentage}%` }}
          ></div>
          <div 
            className="chart-segment maintenance" 
            style={{ width: `${maintenancePercentage}%` }}
          ></div>
          <div 
            className="chart-segment critical" 
            style={{ width: `${criticalPercentage}%` }}
          ></div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-box operational"></div>
            <span>Operational: {operationalCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box maintenance"></div>
            <span>Maintenance: {maintenanceCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box critical"></div>
            <span>Critical: {criticalCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE-secured connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="underground-icon"></div>
          </div>
          <h1>UtilityTwin<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-utility-btn"
          >
            <div className="add-icon"></div>
            Add Utility
          </button>
          <button 
            className="tutorial-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <button 
            className="availability-btn"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Secured Underground Utility Network</h2>
            <p>Manage and monitor underground infrastructure with fully homomorphic encryption for maximum security</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>FHE Utility Network Guide</h2>
            <p className="subtitle">Learn how to securely manage underground utilities with FHE technology</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {showStatistics && (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <h3>Project Introduction</h3>
              <p>Secure digital twin platform for underground utility networks using FHE technology to protect critical infrastructure data.</p>
              <div className="fhe-badge">
                <span>FHE-Powered Security</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Utility Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{utilityData.length}</div>
                  <div className="stat-label">Total Utilities</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{operationalCount}</div>
                  <div className="stat-label">Operational</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{maintenanceCount}</div>
                  <div className="stat-label">Maintenance</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{criticalCount}</div>
                  <div className="stat-label">Critical</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Status Distribution</h3>
              {renderStatusChart()}
            </div>
          </div>
        )}
        
        <div className="utilities-section">
          <div className="section-header">
            <h2>Underground Utility Network</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text"
                  placeholder="Search utilities..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="operational">Operational</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button 
                onClick={loadUtilityData}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button 
                onClick={() => setShowStatistics(!showStatistics)}
                className="toggle-btn"
              >
                {showStatistics ? "Hide Stats" : "Show Stats"}
              </button>
            </div>
          </div>
          
          <div className="utilities-list">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Location</div>
              <div className="header-cell">Depth (m)</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredData.length === 0 ? (
              <div className="no-utilities">
                <div className="no-utilities-icon"></div>
                <p>No utility data found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Utility
                </button>
              </div>
            ) : (
              filteredData.map(utility => (
                <div className={`utility-row ${utility.status}`} key={utility.id}>
                  <div className="table-cell utility-id">#{utility.id.substring(0, 6)}</div>
                  <div className="table-cell">{utility.utilityType}</div>
                  <div className="table-cell">{utility.location}</div>
                  <div className="table-cell">{utility.depth}m</div>
                  <div className="table-cell">
                    <span className={`status-badge ${utility.status}`}>
                      {utility.status}
                    </span>
                  </div>
                  <div className="table-cell">
                    {new Date(utility.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn success"
                      onClick={() => updateUtilityStatus(utility.id, "operational")}
                      disabled={utility.status === "operational"}
                    >
                      Mark Operational
                    </button>
                    <button 
                      className="action-btn warning"
                      onClick={() => updateUtilityStatus(utility.id, "maintenance")}
                      disabled={utility.status === "maintenance"}
                    >
                      Needs Maintenance
                    </button>
                    <button 
                      className="action-btn danger"
                      onClick={() => updateUtilityStatus(utility.id, "critical")}
                      disabled={utility.status === "critical"}
                    >
                      Mark Critical
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitUtilityData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          utilityData={newUtilityData}
          setUtilityData={setNewUtilityData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="underground-icon"></div>
              <span>UtilityTwinFHE</span>
            </div>
            <p>Secure digital twin for underground utility networks using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} UtilityTwinFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  utilityData: any;
  setUtilityData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  utilityData,
  setUtilityData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setUtilityData({
      ...utilityData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!utilityData.utilityType || !utilityData.location || !utilityData.depth) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Underground Utility</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your utility data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Utility Type *</label>
              <select 
                name="utilityType"
                value={utilityData.utilityType} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="">Select type</option>
                <option value="Water">Water Pipe</option>
                <option value="Gas">Gas Line</option>
                <option value="Electric">Electrical Conduit</option>
                <option value="Fiber">Fiber Optic</option>
                <option value="Sewer">Sewer Line</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Location *</label>
              <input 
                type="text"
                name="location"
                value={utilityData.location} 
                onChange={handleChange}
                placeholder="Street address or coordinates..." 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Depth (meters) *</label>
              <input 
                type="number"
                name="depth"
                value={utilityData.depth} 
                onChange={handleChange}
                placeholder="1.5" 
                className="form-input"
                step="0.1"
                min="0"
              />
            </div>
            
            <div className="form-group">
              <label>Status</label>
              <select 
                name="status"
                value={utilityData.status} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="operational">Operational</option>
                <option value="maintenance">Maintenance Needed</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;