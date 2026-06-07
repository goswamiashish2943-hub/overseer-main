// test-sandbox/event-bus.js
// Simulates a simple pub/sub event bus

const listeners = new Map();
const wildcardListeners = []; // catch-all listeners
let globalErrorHandler = null;

function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(handler);
}

function off(event, handler) {
  if (!listeners.has(event)) return;
  listeners.set(event, listeners.get(event).filter(h => h !== handler));
}

function emit(event, payload) {
  const handlers = listeners.get(event) || [];
  // Also fire wildcard listeners
  const allHandlers = [...handlers, ...wildcardListeners];
  allHandlers.forEach(h => {
    try { h(payload, event); }
    catch (e) {
      if (globalErrorHandler) globalErrorHandler(e, event);
      else console.error(`[EventBus] Handler error for ${event}:`, e.message);
    }
  });
}

function onAny(handler) {
  wildcardListeners.push(handler);
}

function setErrorHandler(fn) {
  globalErrorHandler = fn;
}

function once(event, handler) {
  const wrapper = (payload) => { handler(payload); off(event, wrapper); };
  on(event, wrapper);
}

module.exports = { on, off, emit, once };
