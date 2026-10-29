"use strict";

class SocketTestClient {
  constructor(baseUrl) {
    this.socket = new WebSocket(`${baseUrl.replace(/\/$/, "")}/socket.io/?EIO=4&transport=websocket`);
    this.nextAckId = 1;
    this.pendingAcks = new Map();
    this.waiters = new Map();
    this.queuedEvents = new Map();
    this.connected = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket.IO connection timed out")), 5000);
      this.socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WebSocket connection failed")); }, { once: true });
      this.socket.addEventListener("message", (event) => {
        const packet = String(event.data);
        if (packet.startsWith("0")) {
          this.socket.send("40");
          return;
        }
        if (packet === "2") {
          this.socket.send("3");
          return;
        }
        if (packet.startsWith("40")) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        if (packet.startsWith("43")) {
          const match = packet.match(/^43(\d+)(.*)$/);
          if (!match) return;
          const pending = this.pendingAcks.get(Number(match[1]));
          if (!pending) return;
          this.pendingAcks.delete(Number(match[1]));
          const values = JSON.parse(match[2] || "[]");
          pending.resolve(values[0]);
          return;
        }
        if (packet.startsWith("42")) {
          const values = JSON.parse(packet.slice(2));
          const [name, payload] = values;
          const waiters = this.waiters.get(name) || [];
          const waiter = waiters.shift();
          if (waiter) waiter.resolve(payload);
          else {
            const queue = this.queuedEvents.get(name) || [];
            queue.push(payload);
            this.queuedEvents.set(name, queue);
          }
        }
      });
    });
  }

  async send(eventName, payload = {}) {
    await this.connected;
    this.socket.send(`42${JSON.stringify([eventName, payload])}`);
  }

  async emit(eventName, payload = {}) {
    await this.connected;
    const id = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(new Error(`Socket.IO acknowledgement timed out for ${eventName}`));
      }, 5000);
      this.pendingAcks.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); }
      });
      this.socket.send(`42${id}${JSON.stringify([eventName, payload])}`);
    });
  }

  waitFor(eventName, timeoutMs = 5000) {
    const queue = this.queuedEvents.get(eventName) || [];
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve, reject) => {
      const waiters = this.waiters.get(eventName) || [];
      const waiter = {
        resolve: (value) => { clearTimeout(timer); resolve(value); }
      };
      const timer = setTimeout(() => {
        const current = this.waiters.get(eventName) || [];
        this.waiters.set(eventName, current.filter((entry) => entry !== waiter));
        reject(new Error(`Timed out waiting for Socket.IO event ${eventName}`));
      }, timeoutMs);
      waiters.push(waiter);
      this.waiters.set(eventName, waiters);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 300);
      this.socket.addEventListener("close", () => { clearTimeout(timer); resolve(); }, { once: true });
      try { this.socket.close(); } catch { clearTimeout(timer); resolve(); }
    });
  }
}

module.exports = { SocketTestClient };
