const fs = require("fs");

let appTsx = fs.readFileSync("src/App.tsx", "utf-8");

appTsx = appTsx.replace(
  /const isAdmin =\n\s*user\?\.email\?\.trim\(\)\.toLowerCase\(\) === "angeloperfecto31@gmail\.com";/g,
  `const isAdmin =\n    user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";\n  const hasPremiumAccess = isAdmin || ["premium", "enterprise", "free_trial"].includes(userPlan?.toLowerCase() || "");\n  const hasEnterpriseAccess = isAdmin || ["enterprise"].includes(userPlan?.toLowerCase() || "");`
);

appTsx = appTsx.replace(/userPlan === "premium" \|\| isAdmin/g, 'hasPremiumAccess');
appTsx = appTsx.replace(/userPlan !== "premium" && !isAdmin/g, '!hasPremiumAccess');
appTsx = appTsx.replace(/userPlan !== "premium" \|\| isAdmin/g, '!hasPremiumAccess || isAdmin');
appTsx = appTsx.replace(/userPlan === "premium" \? "PREMIUM PLAN"/g, 'hasPremiumAccess ? "PREMIUM PLAN"');

fs.writeFileSync("src/App.tsx", appTsx);
console.log("Refactored App.tsx");
