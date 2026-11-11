import { AsyncLocalStorage } from "node:async_hooks";
import { Server } from "node:http";

// Only Playwright's Next server preloads this file. Each request has its own test clock.
const testTime = new AsyncLocalStorage();
const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event === "request") {
    const instant = Date.parse(args[0].headers["x-maasii-test-now"]);
    if (Number.isFinite(instant)) return testTime.run(instant, () => emit.call(this, event, ...args));
  }
  return emit.call(this, event, ...args);
};

globalThis.Date = new Proxy(Date, {
  construct(target, args, newTarget) {
    const instant = testTime.getStore();
    return Reflect.construct(target, args.length === 0 && instant !== undefined ? [instant] : args, newTarget);
  },
});
