const fs = require('fs');
let code = fs.readFileSync('src/components/PaymentScreen.tsx', 'utf8');

const targetStr = `{u.plan === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shadow-sm">
                                    Enterprise
                                  </span>`;

const replStr = `{!u.isActive && u.paymentStatus === "unpaid" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200 rounded-md shadow-sm">
                                    Unregistered / No Plan
                                  </span>
                                ) : u.plan === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shadow-sm">
                                    Enterprise
                                  </span>`;

code = code.replace(targetStr, replStr);
fs.writeFileSync('src/components/PaymentScreen.tsx', code);
