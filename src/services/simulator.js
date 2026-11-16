class TrafficSimulator {
  constructor(io, serverRegistry) {
    this.io = io;
    this.servers = serverRegistry;
    this.isRunning = false;
    this.intervalId = null;
  }

  start(intervalMs = 2000) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      const metrics = this.generateTickMetrics();
      if (this.io) {
        this.io.emit('metrics:tick', metrics);
      }
    }, intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    clearInterval(this.intervalId);
    this.isRunning = false;
  }

  generateTickMetrics() {
    const timestamp = new Date().toISOString();
    const serverStats = this.servers.map(server => {
      const latency = Math.floor(Math.random() * 40) + 15;
      const cpuLoad = +(Math.random() * 60 + 20).toFixed(2);
      const memoryUsage = +(Math.random() * 40 + 30).toFixed(2);
      const status = cpuLoad > 75 ? 'DEGRADED' : 'HEALTHY';

      return { id: server.id, name: server.name, latency, cpuLoad, memoryUsage, status };
    });

    const avgLatency = Math.round(serverStats.reduce((acc, s) => acc + s.latency, 0) / serverStats.length);
    const totalRequests = Math.floor(Math.random() * 500) + 1200;

    return {
      timestamp,
      clusterLoad: +(serverStats.reduce((acc, s) => acc + s.cpuLoad, 0) / serverStats.length).toFixed(2),
      avgLatency,
      totalRequests,
      servers: serverStats
    };
  }
}

module.exports = TrafficSimulator;
