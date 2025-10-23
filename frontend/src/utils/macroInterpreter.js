//data section
const resolvers = {
  customerID: (ctx) => ctx.customerID,
  employeeName: (ctx) => ctx.employeeName
}

//interpreter
export function interpreter(text, ctx = {}) {
  if (typeof text !== "string") return "";
  return text.replace(/\{([^{}]+)\}/g, (match, raw) => {
    const key = String(raw).trim();
    const resolver = resolvers[key];
    if (!resolver) return match;
    const val = resolver(ctx);
    return val == null ? "" : String(val);
  });
}