/**
 * ElectricalPH - Demand Formula Calculation & AST Evaluation Engine
 * Allows electrical engineers to customize Max Demand Current formulas safely
 * without arbitrary code execution.
 */

export const DEFAULT_1PH_DEMAND_FORMULA =
  "[(Total Connected VA / Vsys) * 0.80 + (0.25 * HML)] * 1.25";

export const DEFAULT_3PH_DEMAND_FORMULA =
  "[(Iline * 1.732) * 0.80 + I3Φ + (0.25 * HML)] * 1.25";

export interface DemandFormulaConfig {
  mode: "default" | "custom";
  singlePhaseFormula?: string;
  threePhaseFormula?: string;
  custom1PhFormula?: string;
  custom3PhFormula?: string;
}

export interface FormulaVariableDef {
  label: string;
  token: string;
  description: string;
  unit: string;
  system: "1PH" | "3PH" | "BOTH";
  aliases: string[];
}

export const FORMULA_VARIABLES_1PH: FormulaVariableDef[] = [
  {
    label: "Total Connected VA",
    token: "Total Connected VA",
    description: "Total connected load across all branch circuits",
    unit: "VA",
    system: "1PH",
    aliases: [
      "total connected va",
      "total_connected_va",
      "totalconnectedva",
      "total va",
      "total_va",
      "internalconnectedva",
      "totalconnectedload",
    ],
  },
  {
    label: "Vsys",
    token: "Vsys",
    description: "System line voltage",
    unit: "V",
    system: "1PH",
    aliases: ["vsys", "v_sys", "systemvoltage", "voltage", "v"],
  },
  {
    label: "HML",
    token: "HML",
    description: "Highest Motor Load full-load current",
    unit: "A",
    system: "1PH",
    aliases: ["hml", "highest motor load", "highest_motor_load", "largestmotor", "motor_max"],
  },
];

export const FORMULA_VARIABLES_3PH: FormulaVariableDef[] = [
  {
    label: "Iline",
    token: "Iline",
    description: "Maximum single-phase/line-to-line current (Max of Phase A, B, C)",
    unit: "A",
    system: "3PH",
    aliases: ["iline", "i_line", "i_l", "linecurrent", "totalampere", "maxphaseamp"],
  },
  {
    label: "I3Φ",
    token: "I3Φ",
    description: "Total connected 3-phase load current",
    unit: "A",
    system: "3PH",
    aliases: ["i3φ", "i3phi", "i_3phi", "i3phase", "i_3phase", "i3p", "total3phase", "threephasecurrent"],
  },
  {
    label: "HML",
    token: "HML",
    description: "Highest Motor Load full-load current",
    unit: "A",
    system: "3PH",
    aliases: ["hml", "highest motor load", "highest_motor_load", "largestmotor", "motor_max"],
  },
];

export const COMMON_CONSTANTS = [
  { label: "1.25", value: "1.25", description: "125% Continuous / Safety Factor" },
  { label: "0.80", value: "0.80", description: "80% Allowable Demand Factor" },
  { label: "0.25", value: "0.25", description: "25% Additional Largest Motor Factor" },
  { label: "1.732", value: "1.732", description: "√3 (Three-phase line-to-line multiplier)" },
];

export const COMMON_OPERATORS = [
  { label: "+", insert: " + ", symbol: "+", description: "Addition" },
  { label: "−", insert: " - ", symbol: "-", description: "Subtraction" },
  { label: "×", insert: " * ", symbol: "*", description: "Multiplication" },
  { label: "÷", insert: " / ", symbol: "/", description: "Division" },
  { label: "(", insert: "(", symbol: "(", description: "Open Parenthesis" },
  { label: ")", insert: ")", symbol: ")", description: "Close Parenthesis" },
  { label: "^", insert: " ^ ", symbol: "^", description: "Exponentiation" },
];

// AST node types
export type ASTNode =
  | { type: "Number"; value: number; raw: string }
  | { type: "Variable"; name: string; rawLabel: string }
  | { type: "UnaryOp"; op: "+" | "-"; expr: ASTNode }
  | { type: "BinaryOp"; op: "+" | "-" | "*" | "/" | "^"; left: ASTNode; right: ASTNode }
  | { type: "Group"; expr: ASTNode; bracketType: "(" | "[" | "{" };

export interface FormulaValidationResult {
  isValid: boolean;
  errorMessage?: string;
  normalizedFormula?: string;
  ast?: ASTNode;
  detectedVariables?: string[];
}

/**
 * Normalizes symbols in formula text (e.g. replaces Unicode multiplication/division symbols with standard math tokens).
 */
export function normalizeFormulaString(formula: string): string {
  if (!formula) return "";
  return formula
    .replace(/×/g, "*")
    .replace(/·/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .trim();
}

type TokenType = "NUMBER" | "VARIABLE" | "OPERATOR" | "LPAREN" | "RPAREN" | "EOF";

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

/**
 * Custom Tokenizer recognizing numbers, operators, brackets, and multi-word variables.
 */
function tokenizeFormula(
  input: string,
  allowedVariables: FormulaVariableDef[]
): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  // Build alias map
  const aliasMap = new Map<string, FormulaVariableDef>();
  allowedVariables.forEach((v) => {
    aliasMap.set(v.token.toLowerCase(), v);
    aliasMap.set(v.label.toLowerCase(), v);
    v.aliases.forEach((a) => aliasMap.set(a.toLowerCase(), v));
  });

  while (i < len) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Parentheses and brackets
    if (ch === "(" || ch === "[" || ch === "{") {
      tokens.push({ type: "LPAREN", value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      tokens.push({ type: "RPAREN", value: ch, pos: i });
      i++;
      continue;
    }

    // Operators
    if (["+", "-", "*", "/", "^"].includes(ch)) {
      tokens.push({ type: "OPERATOR", value: ch, pos: i });
      i++;
      continue;
    }

    // Numbers (integers & decimals)
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let dotCount = 0;
      while (i < len && /[0-9.]/.test(input[i])) {
        if (input[i] === ".") dotCount++;
        i++;
      }
      if (dotCount > 1) {
        return { tokens: [], error: `Invalid number format with multiple decimal points at character ${start + 1}` };
      }
      tokens.push({ type: "NUMBER", value: input.slice(start, i), pos: start });
      continue;
    }

    // Variables or words
    if (/[a-zA-Z_\u03A6\u03C6]/.test(ch)) {
      const start = i;
      while (i < len && /[a-zA-Z0-9_\s\u03A6\u03C6]/.test(input[i])) {
        // If we hit an operator or parenthesis, stop
        if (["+", "-", "*", "/", "^", "(", ")", "[", "]", "{", "}"].includes(input[i])) {
          break;
        }
        i++;
      }
      const rawWord = input.slice(start, i).trim();
      const normWord = rawWord.toLowerCase();

      // Check if word matches an allowed variable
      const matchedVar = aliasMap.get(normWord);
      if (matchedVar) {
        tokens.push({ type: "VARIABLE", value: matchedVar.token, pos: start });
      } else {
        // Check if prefix matches
        let found = false;
        for (const [alias, vDef] of aliasMap.entries()) {
          if (normWord === alias || normWord.startsWith(alias)) {
            tokens.push({ type: "VARIABLE", value: vDef.token, pos: start });
            i = start + alias.length;
            found = true;
            break;
          }
        }
        if (!found) {
          return {
            tokens: [],
            error: `Unknown variable or symbol "${rawWord}". Please select a valid variable from the available list.`,
          };
        }
      }
      continue;
    }

    return {
      tokens: [],
      error: `Unsupported character "${ch}" at position ${i + 1}. Please use standard numbers, variables, and operators.`,
    };
  }

  // Insert implicit multiplication where needed (e.g. "0.25 HML" or "(A)(B)" or "2(A)")
  const withImplicitMult: Token[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const curr = tokens[k];
    const next = tokens[k + 1];
    withImplicitMult.push(curr);

    if (next) {
      const isCurrTerm = curr.type === "NUMBER" || curr.type === "VARIABLE" || curr.type === "RPAREN";
      const isNextTerm = next.type === "NUMBER" || next.type === "VARIABLE" || next.type === "LPAREN";
      if (isCurrTerm && isNextTerm) {
        withImplicitMult.push({ type: "OPERATOR", value: "*", pos: curr.pos });
      }
    }
  }

  withImplicitMult.push({ type: "EOF", value: "", pos: len });
  return { tokens: withImplicitMult };
}

/**
 * Recursive Descent Parser for safe mathematical expression evaluation.
 */
class FormulaParser {
  private tokens: Token[];
  private cursor = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.cursor] || { type: "EOF", value: "", pos: 0 };
  }

  private consume(): Token {
    const t = this.tokens[this.cursor];
    this.cursor++;
    return t;
  }

  public parse(): { ast?: ASTNode; error?: string } {
    try {
      if (this.peek().type === "EOF") {
        return { error: "Formula is empty. Please enter or build a mathematical expression." };
      }
      const ast = this.parseExpression();
      if (this.peek().type !== "EOF") {
        const extra = this.peek();
        return { error: `Unexpected token "${extra.value}" at position ${extra.pos + 1}. Please check formula syntax.` };
      }
      return { ast };
    } catch (err: any) {
      return { error: err.message || "Invalid mathematical formula syntax." };
    }
  }

  // expr -> term (( '+' | '-' ) term)*
  private parseExpression(): ASTNode {
    let node = this.parseTerm();

    while (this.peek().type === "OPERATOR" && ["+", "-"].includes(this.peek().value)) {
      const op = this.consume().value as "+" | "-";
      const right = this.parseTerm();
      node = { type: "BinaryOp", op, left: node, right };
    }

    return node;
  }

  // term -> power (( '*' | '/' ) power)*
  private parseTerm(): ASTNode {
    let node = this.parsePower();

    while (this.peek().type === "OPERATOR" && ["*", "/"].includes(this.peek().value)) {
      const op = this.consume().value as "*" | "/";
      const right = this.parsePower();
      node = { type: "BinaryOp", op, left: node, right };
    }

    return node;
  }

  // power -> factor ( '^' power )? (right-associative)
  private parsePower(): ASTNode {
    let node = this.parseFactor();

    if (this.peek().type === "OPERATOR" && this.peek().value === "^") {
      this.consume();
      const right = this.parsePower();
      node = { type: "BinaryOp", op: "^", left: node, right };
    }

    return node;
  }

  // factor -> unary | number | variable | group
  private parseFactor(): ASTNode {
    const token = this.peek();

    if (token.type === "OPERATOR" && (token.value === "+" || token.value === "-")) {
      const op = this.consume().value as "+" | "-";
      const expr = this.parseFactor();
      return { type: "UnaryOp", op, expr };
    }

    if (token.type === "NUMBER") {
      this.consume();
      const val = parseFloat(token.value);
      if (isNaN(val)) {
        throw new Error(`Invalid number "${token.value}"`);
      }
      return { type: "Number", value: val, raw: token.value };
    }

    if (token.type === "VARIABLE") {
      this.consume();
      return { type: "Variable", name: token.value, rawLabel: token.value };
    }

    if (token.type === "LPAREN") {
      const openBracket = this.consume().value as "(" | "[" | "{";
      const expr = this.parseExpression();
      const close = this.peek();
      if (close.type !== "RPAREN") {
        throw new Error(`Missing closing parenthesis after "${token.value}". Check bracket matching.`);
      }
      this.consume();
      return { type: "Group", expr, bracketType: openBracket };
    }

    if (token.type === "EOF") {
      throw new Error("Formula ended unexpectedly. An operator is missing its right-hand value.");
    }

    throw new Error(`Unexpected token "${token.value}" at position ${token.pos + 1}.`);
  }
}

/**
 * Validates a formula string for single-phase or three-phase system.
 */
export function validateDemandFormula(
  formula: string,
  systemType: "1PH" | "3PH"
): FormulaValidationResult {
  const clean = formula ? formula.trim() : "";
  if (!clean) {
    return { isValid: false, errorMessage: "Formula cannot be empty." };
  }

  const allowedVars = systemType === "3PH" ? FORMULA_VARIABLES_3PH : FORMULA_VARIABLES_1PH;
  const tokenRes = tokenizeFormula(clean, allowedVars);
  if (tokenRes.error) {
    return { isValid: false, errorMessage: tokenRes.error };
  }

  const parser = new FormulaParser(tokenRes.tokens);
  const parseRes = parser.parse();
  if (parseRes.error || !parseRes.ast) {
    return { isValid: false, errorMessage: parseRes.error || "Invalid formula syntax." };
  }

  // Extract detected variables
  const detected: string[] = [];
  function walk(node: ASTNode) {
    if (node.type === "Variable") {
      if (!detected.includes(node.name)) detected.push(node.name);
    } else if (node.type === "BinaryOp") {
      walk(node.left);
      walk(node.right);
    } else if (node.type === "UnaryOp" || node.type === "Group") {
      walk(node.expr);
    }
  }
  walk(parseRes.ast);

  return {
    isValid: true,
    ast: parseRes.ast,
    detectedVariables: detected,
    normalizedFormula: clean,
  };
}

/**
 * Evaluates an AST node given a dictionary of variable values.
 */
export function evaluateAST(
  node: ASTNode,
  variables: Record<string, number>
): { result: number; error?: string } {
  switch (node.type) {
    case "Number":
      return { result: node.value };

    case "Variable": {
      // Find matching key case-insensitively or via alias
      const nameLower = node.name.toLowerCase();
      let foundVal: number | undefined;

      for (const [key, val] of Object.entries(variables)) {
        if (key.toLowerCase() === nameLower || key.replace(/\s+/g, "").toLowerCase() === nameLower.replace(/\s+/g, "")) {
          foundVal = val;
          break;
        }
      }

      // Variable fallbacks
      if (foundVal === undefined) {
        if (nameLower.includes("connected") || nameLower.includes("total va")) {
          foundVal = variables.Total_Connected_VA || variables.totalConnectedVA || variables.internalConnectedVA || variables.totalVA || 0;
        } else if (nameLower.includes("vsys") || nameLower.includes("voltage")) {
          foundVal = variables.Vsys || variables.systemVoltage || 230;
        } else if (nameLower.includes("hml") || nameLower.includes("motor")) {
          foundVal = variables.HML || variables.largestMotor || 0;
        } else if (nameLower.includes("iline") || nameLower.includes("line")) {
          foundVal = variables.Iline || variables.totalAmpere || 0;
        } else if (nameLower.includes("3") || nameLower.includes("phi") || nameLower.includes("phase")) {
          foundVal = variables["I3Φ"] || variables.I3Phase || variables.total3Phase || 0;
        }
      }

      if (foundVal === undefined || isNaN(foundVal)) {
        return { result: 0, error: `Variable "${node.name}" has no numeric value in current project context.` };
      }
      return { result: foundVal };
    }

    case "UnaryOp": {
      const res = evaluateAST(node.expr, variables);
      if (res.error) return res;
      return { result: node.op === "-" ? -res.result : res.result };
    }

    case "Group": {
      return evaluateAST(node.expr, variables);
    }

    case "BinaryOp": {
      const leftRes = evaluateAST(node.left, variables);
      if (leftRes.error) return leftRes;
      const rightRes = evaluateAST(node.right, variables);
      if (rightRes.error) return rightRes;

      const a = leftRes.result;
      const b = rightRes.result;

      switch (node.op) {
        case "+":
          return { result: a + b };
        case "-":
          return { result: a - b };
        case "*":
          return { result: a * b };
        case "/":
          if (Math.abs(b) < 1e-12) {
            return { result: 0, error: "Division by zero encountered in formula (denominator evaluated to 0)." };
          }
          return { result: a / b };
        case "^":
          return { result: Math.pow(a, b) };
      }
    }
  }
}

/**
 * Evaluates a formula string safely using current variable values.
 */
export function evaluateDemandFormula(
  formula: string,
  variables: Record<string, number>,
  systemType: "1PH" | "3PH" = "1PH"
): { result: number; error?: string } {
  const valRes = validateDemandFormula(formula, systemType);
  if (!valRes.isValid || !valRes.ast) {
    return { result: 0, error: valRes.errorMessage || "Invalid formula" };
  }
  return evaluateAST(valRes.ast, variables);
}

/**
 * Converts AST node to clean mathematical LaTeX string.
 */
function astToLatex(
  node: ASTNode,
  substitutionValues?: Record<string, number>
): string {
  switch (node.type) {
    case "Number":
      return node.raw || String(node.value);

    case "Variable": {
      if (substitutionValues) {
        const evalRes = evaluateAST(node, substitutionValues);
        if (!evalRes.error && Number.isFinite(evalRes.result)) {
          return evalRes.result.toFixed(2);
        }
      }
      if (node.name === "Total Connected VA" || node.name.toLowerCase().includes("connected")) {
        return "\\text{Total Connected VA}";
      }
      if (node.name === "Vsys" || node.name.toLowerCase().includes("vsys")) {
        return "V_{sys}";
      }
      if (node.name === "HML") {
        return "\\text{HML}";
      }
      if (node.name === "Iline" || node.name.toLowerCase().includes("iline")) {
        return "I_{\\text{line}}";
      }
      if (node.name === "I3Φ" || node.name.toLowerCase().includes("3")) {
        return "I_{3\\Phi}";
      }
      return `\\text{${node.name}}`;
    }

    case "UnaryOp":
      return `${node.op}${astToLatex(node.expr, substitutionValues)}`;

    case "Group": {
      const inner = astToLatex(node.expr, substitutionValues);
      if (node.bracketType === "[") {
        return `\\left[ ${inner} \\right]`;
      }
      return `\\left( ${inner} \\right)`;
    }

    case "BinaryOp": {
      if (node.op === "/") {
        const numer = astToLatex(node.left, substitutionValues);
        const denom = astToLatex(node.right, substitutionValues);
        return `\\frac{${numer}}{${denom}}`;
      }
      if (node.op === "*") {
        const left = astToLatex(node.left, substitutionValues);
        const right = astToLatex(node.right, substitutionValues);
        return `${left} \\times ${right}`;
      }
      if (node.op === "^") {
        const left = astToLatex(node.left, substitutionValues);
        const right = astToLatex(node.right, substitutionValues);
        return `{${left}}^{${right}}`;
      }
      const left = astToLatex(node.left, substitutionValues);
      const right = astToLatex(node.right, substitutionValues);
      return `${left} ${node.op} ${right}`;
    }
  }
}

/**
 * Formats formula to LaTeX display string.
 */
export function formulaToLatex(
  formula: string,
  systemType: "1PH" | "3PH",
  options?: {
    substitutionValues?: Record<string, number>;
    showResult?: boolean;
    resultVal?: number;
  }
): string {
  const valRes = validateDemandFormula(formula, systemType);
  const title =
    systemType === "3PH"
      ? "\\text{Max Demand Current (3}\\Phi\\text{)}"
      : "\\text{Max Demand Current (1}\\Phi\\text{)}";

  if (!valRes.isValid || !valRes.ast) {
    return `${title} = \\text{Formula Error}`;
  }

  const exprLatex = astToLatex(valRes.ast, options?.substitutionValues);

  if (options?.showResult && options.resultVal !== undefined) {
    return `${title} = ${exprLatex} = \\mathbf{${options.resultVal.toFixed(2)}\\text{ A}}`;
  }

  return `${title} = ${exprLatex}`;
}
