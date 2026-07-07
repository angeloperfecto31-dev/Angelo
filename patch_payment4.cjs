const fs = require('fs');
let code = fs.readFileSync('src/components/PaymentScreen.tsx', 'utf8');

const targetStr = `{finance.planStr === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/40 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                                    Enterprise
                                  </span>`;

const replStr = `{!isUserActive && u.paymentStatus === "unpaid" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200 rounded-md shadow-sm">
                                    Unregistered / No Plan
                                  </span>
                                ) : finance.planStr === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/40 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                                    Enterprise
                                  </span>`;

code = code.replace(targetStr, replStr);
fs.writeFileSync('src/components/PaymentScreen.tsx', code);
