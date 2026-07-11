import re

with open("src/constants.ts", "r") as f:
    content = f.read()

flex_old = '{ size: "100mm", limit: 3260 },\n  ],\n};\n'
flex_new = '{ size: "100mm", limit: 3260 },\n    { size: "125mm", limit: 5160 },\n    { size: "150mm", limit: 7460 },\n    { size: "200mm", limit: 12900 },\n  ],\n};\n'
content = content.replace(flex_old, flex_new)

with open("src/constants.ts", "w") as f:
    f.write(content)
