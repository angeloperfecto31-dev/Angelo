const fs = require('fs');
let code = fs.readFileSync('src/components/PaymentScreen.tsx', 'utf8');

const targetStr = `{finance.planStr === "enterprise" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 rounded border border-indigo-205/15">
                                  ENTERPRISE
                                </span>`;

const replStr = `{!isUserActive && u.paymentStatus === "unpaid" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-slate-50 text-slate-500 rounded border border-slate-200">
                                  UNREGISTERED
                                </span>
                              ) : finance.planStr === "enterprise" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 rounded border border-indigo-205/15">
                                  ENTERPRISE
                                </span>`;

code = code.replace(targetStr, replStr);
fs.writeFileSync('src/components/PaymentScreen.tsx', code);
