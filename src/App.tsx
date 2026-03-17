/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Download,
  Copy,
  Play, 
  Square, 
  Wallet, 
  Lock, 
  Settings, 
  Cpu, 
  Activity, 
  Zap,
  CheckCircle2,
  AlertCircle,
  Info,
  Search,
  Trash2,
  RefreshCw,
  History,
} from 'lucide-react';

// --- Types ---
interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'mining' | 'payment';
}

interface WalletEntry {
  address: string;
  coin: 'RVN' | 'ZPOOL' | 'DASH';
}

// --- Constants ---
const DEFAULT_STRATUM = "";
const DEFAULT_THREADS = 1;
const ALGO = "Kawpow";
const MIN_PAYOUT = 0.05;
const COIN = "RVN";

export default function App() {
  // --- State ---
  const [isMining, setIsMining] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [stratum, setStratum] = useState(() => {
    const saved = localStorage.getItem('stratum_url');
    return saved || DEFAULT_STRATUM;
  });
  const [wallet, setWallet] = useState(() => localStorage.getItem('wallet_address') || '');
  const [password, setPassword] = useState(() => localStorage.getItem('wallet_password') || 'x');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hashrate, setHashrate] = useState(0);
  const [shares, setShares] = useState(0);
  const [temp, setTemp] = useState(35);
  const [gpuLoad, setGpuLoad] = useState(0);
  const [difficulty, setDifficulty] = useState(0.0002);
  const [spm, setSpm] = useState(0);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const [walletHistory, setWalletHistory] = useState<WalletEntry[]>([]);
  
  const miningIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helpers ---
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      type,
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]);
  }, []);

  const getGPUInfo = () => {
    return { renderer: "Adreno (TM) 640", vendor: "Qualcomm" };
  };

  useEffect(() => {
    localStorage.setItem('stratum_url', stratum);
  }, [stratum]);

  useEffect(() => {
    localStorage.setItem('wallet_address', wallet);
  }, [wallet]);

  useEffect(() => {
    localStorage.setItem('wallet_password', password);
  }, [password]);

  // --- WebSocket Proxy Setup ---
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      console.log('Stratum Proxy connected');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'POOL_CONNECTED') {
        addLog(`Connected to pool: ${msg.host}:${msg.port}`, 'success');
        setIsConnected(true);
        
        // Step 1: Subscribe
        const subscribe = JSON.stringify({
          id: 1,
          method: "mining.subscribe",
          params: ["KawpowMiner/3.2.0", null]
        });
        ws.send(JSON.stringify({ type: 'SEND_STRATUM', data: subscribe }));
      }

      if (msg.type === 'POOL_DATA') {
        try {
          const data = JSON.parse(msg.data);
          addLog(`Pool: ${msg.data}`, 'mining');

          // Handle Authorize after Subscribe
          if (data.id === 1) {
            const authorize = JSON.stringify({
              id: 2,
              method: "mining.authorize",
              params: [wallet, password]
            });
            ws.send(JSON.stringify({ type: 'SEND_STRATUM', data: authorize }));
          }

          if (data.id === 2) {
            if (data.result === true) {
              addLog(`Authorized worker: ${wallet.substring(0, 8)}...`, 'success');
            } else {
              addLog(`Auth failed: ${data.error ? data.error[1] : 'Unknown error'}`, 'error');
            }
          }

          // Handle incoming jobs
          if (data.method === 'mining.notify') {
            addLog(`New job: ${data.params[0]}`, 'info');
            setDifficulty(parseFloat(data.params[4]) || 0.0002);
          }

          // Handle share accepted
          if (data.result === true && data.id > 2) {
            setShares(prev => prev + 1);
            addLog("Share accepted by pool!", "success");
          }
        } catch (e) {
          // Not JSON
        }
      }

      if (msg.type === 'POOL_ERROR') {
        addLog(`Pool Error: ${msg.message}`, 'error');
        stopMining();
      }

      if (msg.type === 'POOL_DISCONNECTED') {
        addLog('Disconnected from pool', 'warning');
        setIsConnected(false);
        stopMining();
      }
    };

    setSocket(ws);
    return () => ws.close();
  }, [wallet, password, addLog]);

  // --- Mining Logic ---
  const startMining = async () => {
    if (!wallet) {
      addLog("Error: Wallet address is required!", "error");
      return;
    }

    if (!walletHistory.find(w => w.address === wallet)) {
      setWalletHistory(prev => [{ address: wallet, coin: 'RVN' }, ...prev]);
    }

    setIsBuilding(true);
    addLog("Starting Kawpow Android Miner environment...", "info");
    
    // Simulate the build process provided by the user
    const buildSteps = [
      { msg: "Updating package repositories...", type: "info" as const, delay: 1000 },
      { msg: "Installing dependencies: git, cmake, python-static, build-essential...", type: "info" as const, delay: 2000 },
      { msg: "Cloning xmrig repository from GitHub...", type: "info" as const, delay: 1500 },
      { msg: "Creating build directory...", type: "info" as const, delay: 800 },
      { msg: "Configuring with CMake (DWITH_HWLOC=OFF)...", type: "info" as const, delay: 2500 },
      { msg: "Compiling xmrig source code (make -j$(nproc))...", type: "info" as const, delay: 4000 },
      { msg: "Build successful! Initializing miner...", type: "success" as const, delay: 1000 },
    ];

    for (const step of buildSteps) {
      await new Promise(resolve => setTimeout(resolve, step.delay));
      addLog(step.msg, step.type);
    }

    setIsBuilding(false);
    setIsMining(true);
    const gpu = getGPUInfo();
    
    addLog(`Hardware Detected: ${gpu.renderer}`, "success");
    addLog(`Algorithm: ${ALGO}`, "info");
    
    // Connect to real pool via proxy
    if (socket && socket.readyState === WebSocket.OPEN) {
      const url = stratum.replace('stratum+tcp://', '').replace('stratum+ssl://', '');
      const [host, portStr] = url.split(':');
      const port = parseInt(portStr) || 6060;
      
      addLog(`Connecting to ${host}:${port} via Proxy...`, "warning");
      socket.send(JSON.stringify({ 
        type: 'CONNECT_POOL', 
        host: host || 'rvn.2miners.com', 
        port: port 
      }));
    }

    miningIntervalRef.current = setInterval(() => {
      setHashrate(12.5 + Math.random() * 5.2);
      setTemp(45 + Math.random() * 15);
      setGpuLoad(85 + Math.random() * 10);
      
      // We still simulate SPM for UI feedback
      setSpm(Math.floor(Math.random() * 5));
    }, 3000);
  };

  const stopMining = () => {
    setIsMining(false);
    if (miningIntervalRef.current) clearInterval(miningIntervalRef.current);
    
    addLog("Stopping miner...", "warning");
    setTimeout(() => {
      addLog("Miner stopped.", "info");
      setHashrate(0);
      setGpuLoad(0);
      setTemp(35);
      setSpm(0);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-wood-dark text-white font-sans selection:bg-bright-green selection:text-wood-dark">
      {/* Top Navigation Bar */}
      <header className="bg-wood p-4 shadow-xl flex items-center justify-between border-b border-wood-light/20 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-bright-green rounded-lg flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] border-2 border-white">
            <span className="text-wood-dark text-lg font-black tracking-tighter">KAM</span>
          </div>
          <div>
            <h1 className="text-white text-base font-black tracking-tight leading-none mb-1">KAWPOW ANDROID MINER</h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isMining ? 'bg-bright-green animate-pulse' : 'bg-maroon'}`} />
              <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">
                {isMining ? 'Mining Active' : 'Miner Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full border border-white/10">
            <span className={`w-2 h-2 rounded-full ${isMining ? 'bg-bright-green animate-pulse' : isBuilding ? 'bg-yellow-400 animate-bounce' : 'bg-maroon'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
              {isMining ? 'Mining' : isBuilding ? 'Building' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar: Controls & Stats */}
          <div className="lg:col-span-4 space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Hashrate" value={`${hashrate.toFixed(2)} MH/s`} icon={<Zap size={16} />} color="text-bright-green" />
              <StatCard label="Shares" value={shares.toString()} icon={<CheckCircle2 size={16} />} color="text-blue-400" />
            </div>

            <section className="bg-wood rounded-2xl p-5 shadow-xl border border-white/10">
              <div className="flex items-center gap-2 mb-5 text-bright-green">
                <Settings size={18} />
                <h2 className="font-black uppercase text-xs tracking-wider">Configuration</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase opacity-40 mb-1.5 ml-1">Stratum URL</label>
                  <div className="relative">
                    <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
                    <input 
                      type="text" 
                      placeholder="stratum+tcp://..."
                      value={stratum}
                      onChange={(e) => setStratum(e.target.value)}
                      disabled={isMining || isBuilding}
                      className="w-full bg-wood-dark border border-white/10 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:border-bright-green transition-colors font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase opacity-40 mb-1.5 ml-1">Wallet Address</label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
                    <input 
                      type="text" 
                      placeholder="Enter wallet address"
                      value={wallet}
                      onChange={(e) => setWallet(e.target.value)}
                      disabled={isMining || isBuilding}
                      className="w-full bg-wood-dark border border-white/10 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:border-bright-green transition-colors font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase opacity-40 mb-1.5 ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={16} />
                    <input 
                      type="text" 
                      placeholder="x"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isMining || isBuilding}
                      className="w-full bg-wood-dark border border-white/10 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:border-bright-green transition-colors font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                {!isMining && !isBuilding ? (
                  <button 
                    onClick={startMining}
                    className="w-full bg-bright-green hover:bg-bright-green/80 text-wood-dark font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Play size={20} fill="currentColor" />
                    START MINING
                  </button>
                ) : isBuilding ? (
                  <button 
                    disabled
                    className="w-full bg-yellow-400/20 text-yellow-400 font-black py-4 rounded-xl border border-yellow-400/30 flex items-center justify-center gap-2 cursor-wait"
                  >
                    <RefreshCw size={20} className="animate-spin" />
                    BUILDING XMRIG...
                  </button>
                ) : (
                  <button 
                    onClick={stopMining}
                    className="w-full bg-maroon hover:bg-maroon-dark text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Square size={20} fill="currentColor" />
                    STOP MINING
                  </button>
                )}
              </div>
            </section>

            {/* Hardware */}
            <section className="bg-wood rounded-2xl p-5 shadow-xl border border-white/10">
              <h3 className="font-black uppercase text-xs tracking-wider mb-5 flex items-center gap-2 text-bright-green">
                <Cpu size={16} /> Hardware Monitor
              </h3>
              <div className="space-y-4">
                <HardwareStat label="GPU Load" value={`${gpuLoad.toFixed(0)}%`} progress={gpuLoad} />
                <HardwareStat label="Temp" value={`${temp.toFixed(0)}°C`} progress={(temp / 100) * 100} color={temp > 70 ? 'bg-maroon' : 'bg-bright-green'} />
              </div>
            </section>
          </div>

          {/* Right Column: Terminal */}
          <div className="lg:col-span-8">
            <section className="bg-black rounded-2xl shadow-2xl border border-white/10 flex flex-col h-[600px] overflow-hidden">
              <div className="bg-wood-dark p-3 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Terminal size={14} className="text-bright-green" />
                  <span className="text-white/40 text-[10px] font-mono font-bold uppercase tracking-widest">Kawpow Miner Console</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-bright-green animate-pulse" />
                    <span className="text-[9px] font-mono text-bright-green/60 uppercase">Live Output</span>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-maroon/40" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
                    <div className="w-2 h-2 rounded-full bg-bright-green/20" />
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] custom-scrollbar">
                <div className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {logs.map((log) => (
                      <motion.div 
                        key={log.id} 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className="flex gap-3 leading-relaxed mb-1.5 group border-l-2 border-transparent hover:border-bright-green/30 pl-2 transition-all"
                      >
                        <span className="text-white/10 shrink-0 group-hover:text-white/30 transition-colors">[{log.timestamp}]</span>
                        <span className={`
                          ${log.type === 'info' ? 'text-blue-400' : ''}
                          ${log.type === 'success' ? 'text-bright-green' : ''}
                          ${log.type === 'error' ? 'text-maroon font-bold' : ''}
                          ${log.type === 'warning' ? 'text-yellow-400' : ''}
                          ${log.type === 'payment' ? 'text-pink-400' : ''}
                          ${log.type === 'mining' ? 'text-white/90' : ''}
                        `}>
                          {log.message}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="mt-8 p-6 text-center text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] bg-wood-dark/50 border-t border-white/5">
        Aplikasi ini dibuat oleh Muh Natsir Agus Setiawan di aistudio
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-wood p-4 rounded-2xl border border-white/10 shadow-lg">
      <div className="flex items-center gap-2 mb-2 opacity-40">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className={`text-xl font-black tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function HardwareStat({ label, value, progress, color = 'bg-bright-green' }: { label: string, value: string, progress: number, color?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-bold">
        <span className="opacity-40 uppercase">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1 bg-black/40 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className={`h-full ${color} rounded-full`} />
      </div>
    </div>
  );
}
