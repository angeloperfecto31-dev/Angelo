const fs = require('fs');
let code = fs.readFileSync('src/components/PaymentScreen.tsx', 'utf8');

const target = `                                {u.plan === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shadow-sm">
                                    Enterprise
                                  </span>
                                ) : isPremiumTier ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200/40 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                                    Premium Pro
                                  </span>
                                ) : false ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-700 border border-slate-200 rounded-md shadow-sm">
                                    Standard
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md shadow-sm">
                                    Basic Tier
                                  </span>
                                )}`;

const replacement = `                                {!u.isActive && u.paymentStatus === "unpaid" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200 rounded-md shadow-sm">
                                    Unregistered / No Plan
                                  </span>
                                ) : u.plan === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shadow-sm">
                                    Enterprise
                                  </span>
                                ) : isPremiumTier ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200/40 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                                    Premium Pro
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md shadow-sm">
                                    Basic (Paid)
                                  </span>
                                )}`;

code = code.replace(target, replacement);

const target2 = `                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Requested Plan</th>`;
const replacement2 = `                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Attempted Plan</th>`;
code = code.replace(target2, replacement2);

fs.writeFileSync('src/components/PaymentScreen.tsx', code);
console.log('PaymentScreen.tsx patched');
