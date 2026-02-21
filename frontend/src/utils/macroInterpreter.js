//data section
const resolvers = {
  customerID: (ctx) => ctx.customerID,
  employeeName: (ctx) => ctx.employeeName,
  customerFullName: (ctx) => ctx.customerFullName,
  customerFirstName: (ctx) => ctx.customerFirstName,
  customerLastName: (ctx) => ctx.customerLastName,
  shopifyLastOrderNumber: (ctx) => ctx.shopifyLastOrderNumber,
  customerEmail: (ctx) => ctx.customerEmail
}

// S4 fix: HTML-escape interpolated values to prevent XSS when rendered as HTML
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

//interpreter
export function interpreter(text, ctx = {}) {
  if (typeof text !== "string") return "";
  return text.replace(/\{([^{}]+)\}/g, (match, raw) => {
    const key = String(raw).trim();
    const resolver = resolvers[key];
    if (!resolver) return match;
    const val = resolver(ctx);
    return val == null ? "" : escapeHtml(String(val));
  });
}