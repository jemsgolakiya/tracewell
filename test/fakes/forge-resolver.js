export default class Resolver {
  constructor() { this.defs = {}; }
  define(name, fn) { this.defs[name] = fn; }
  getDefinitions() { return this.defs; }
}
