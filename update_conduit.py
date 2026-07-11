import re

with open("src/constants.ts", "r") as f:
    content = f.read()

# Update CONDUIT_SIZES
old_sizes = "export const CONDUIT_SIZES = ['15mm', '20mm', '25mm', '32mm', '40mm', '50mm', '65mm', '80mm', '90mm', '100mm'];"
new_sizes = "export const CONDUIT_SIZES = ['15mm', '20mm', '25mm', '32mm', '40mm', '50mm', '65mm', '80mm', '90mm', '100mm', '125mm', '150mm', '200mm'];"
content = content.replace(old_sizes, new_sizes)

# Update PVC
pvc_old = '{ size: "100mm", limit: 3240 },\n  ],'
pvc_new = '{ size: "100mm", limit: 3240 },\n    { size: "125mm", limit: 5160 },\n    { size: "150mm", limit: 7460 },\n    { size: "200mm", limit: 12900 },\n  ],'
content = content.replace(pvc_old, pvc_new)

# Update EMT
emt_old = '{ size: "100mm", limit: 3800 },\n  ],'
emt_new = '{ size: "100mm", limit: 3800 },\n    { size: "125mm", limit: 6040 },\n    { size: "150mm", limit: 8730 },\n    { size: "200mm", limit: 15100 },\n  ],'
content = content.replace(emt_old, emt_new)

# Update RSC
rsc_old = '{ size: "100mm", limit: 3400 },\n  ],'
rsc_new = '{ size: "100mm", limit: 3400 },\n    { size: "125mm", limit: 5420 },\n    { size: "150mm", limit: 7830 },\n    { size: "200mm", limit: 13500 },\n  ],'
content = content.replace(rsc_old, rsc_new)

# Update IMC
imc_old = '{ size: "100mm", limit: 3870 },\n  ],'
imc_new = '{ size: "100mm", limit: 3870 },\n    { size: "125mm", limit: 6140 },\n    { size: "150mm", limit: 8870 },\n    { size: "200mm", limit: 15350 },\n  ],'
content = content.replace(imc_old, imc_new)

# Update FMC
fmc_old = '{ size: "100mm", limit: 3260 },\n  ],'
fmc_new = '{ size: "100mm", limit: 3260 },\n    { size: "125mm", limit: 5160 },\n    { size: "150mm", limit: 7460 },\n    { size: "200mm", limit: 12900 },\n  ],'
content = content.replace(fmc_old, fmc_new)

with open("src/constants.ts", "w") as f:
    f.write(content)
