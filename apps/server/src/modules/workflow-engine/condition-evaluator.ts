import jsep from "jsep";

/**
 * Sandboxed condition expressions for workflow `condition` nodes (T127, research R6).
 *
 * `jsep` only PARSES the expression into an AST; this module interprets a small whitelist of node
 * types itself — nothing is ever compiled to JavaScript, there is no `eval`/`Function` and no
 * property access on real objects. The only variables are `nodes.<id>.status` and
 * `nodes.<id>.output` (or `nodes["<id>"].…` for ids that are not identifiers) of nodes that have
 * already finished. Supported: string/number/boolean/null literals, `== != === !== < <= > >=`,
 * `&& || !`, unary `-`, parentheses and `contains(text, part)`.
 */

export class ConditionError extends Error {
  override readonly name = "ConditionError";
}

/** What a condition can see about one finished node. */
export interface FinishedNode {
  status: string;
  output: string | null;
}
export type ConditionScope = Readonly<Record<string, FinishedNode>>;

export interface CompiledCondition {
  /** node ids the expression reads, in order of appearance */
  readonly refs: ReadonlySet<string>;
  evaluate(scope: ConditionScope): boolean;
}

type Value = string | number | boolean | null;
type Program = (scope: ConditionScope) => Value;

const NODE_PROPS = new Set(["status", "output"]);
const COMPARISONS: Readonly<Record<string, (a: Value, b: Value) => boolean>> = {
  "==": (a, b) => a === b,
  "===": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  "!==": (a, b) => a !== b,
  "<": (a, b) => a !== null && b !== null && a < b,
  "<=": (a, b) => a !== null && b !== null && a <= b,
  ">": (a, b) => a !== null && b !== null && a > b,
  ">=": (a, b) => a !== null && b !== null && a >= b,
};

const truthy = (v: Value): boolean => Boolean(v);

function literal(node: jsep.Literal): Program {
  const v = node.value;
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return () => v;
  }
  throw new ConditionError(`Unsupported literal ${String(node.raw)}`);
}

/** `nodes.<id>` or `nodes["<id>"]` → the id */
function nodeIdOf(obj: jsep.Expression): string {
  if (obj.type !== "MemberExpression") throw new ConditionError("Expected nodes.<id>.<property>");
  const m = obj as jsep.MemberExpression;
  if (m.object.type !== "Identifier" || (m.object as jsep.Identifier).name !== "nodes") {
    throw new ConditionError("Only `nodes` can be read");
  }
  if (!m.computed && m.property.type === "Identifier") return (m.property as jsep.Identifier).name;
  if (m.computed && m.property.type === "Literal") {
    const v = (m.property as jsep.Literal).value;
    if (typeof v === "string" && v.length > 0) return v;
  }
  throw new ConditionError("A node id must be a name or a string literal");
}

function member(node: jsep.MemberExpression, refs: Set<string>): Program {
  if (node.computed || node.property.type !== "Identifier") {
    throw new ConditionError("Use nodes.<id>.status or nodes.<id>.output");
  }
  const prop = (node.property as jsep.Identifier).name;
  if (!NODE_PROPS.has(prop)) throw new ConditionError(`Unknown node property "${prop}"`);
  const id = nodeIdOf(node.object);
  refs.add(id);
  return (scope) => {
    if (!Object.hasOwn(scope, id)) {
      throw new ConditionError(`Node "${id}" has not finished (or is not before this condition)`);
    }
    const n = scope[id] as FinishedNode;
    return prop === "status" ? n.status : n.output;
  };
}

function call(node: jsep.CallExpression, refs: Set<string>): Program {
  if (node.callee.type !== "Identifier" || (node.callee as jsep.Identifier).name !== "contains") {
    throw new ConditionError("Only contains(text, part) can be called");
  }
  if (node.arguments.length !== 2) throw new ConditionError("contains takes two arguments");
  const [text, part] = node.arguments.map((a) => build(a, refs)) as [Program, Program];
  return (scope) => {
    const t = text(scope);
    const p = part(scope);
    return typeof t === "string" && typeof p === "string" && t.includes(p);
  };
}

function binary(node: jsep.BinaryExpression, refs: Set<string>): Program {
  const left = build(node.left, refs);
  const right = build(node.right, refs);
  if (node.operator === "&&") return (s) => truthy(left(s)) && truthy(right(s));
  if (node.operator === "||") return (s) => truthy(left(s)) || truthy(right(s));
  const cmp = Object.hasOwn(COMPARISONS, node.operator) ? COMPARISONS[node.operator] : undefined;
  if (!cmp) throw new ConditionError(`Operator "${node.operator}" is not supported`);
  return (s) => cmp(left(s), right(s));
}

function unary(node: jsep.UnaryExpression, refs: Set<string>): Program {
  const arg = build(node.argument, refs);
  if (node.operator === "!") return (s) => !truthy(arg(s));
  if (node.operator === "-") {
    return (s) => {
      const v = arg(s);
      if (typeof v !== "number") throw new ConditionError("Unary minus needs a number");
      return -v;
    };
  }
  throw new ConditionError(`Operator "${node.operator}" is not supported`);
}

function build(node: jsep.Expression, refs: Set<string>): Program {
  switch (node.type) {
    case "Literal":
      return literal(node as jsep.Literal);
    case "MemberExpression":
      return member(node as jsep.MemberExpression, refs);
    case "CallExpression":
      return call(node as jsep.CallExpression, refs);
    case "BinaryExpression":
      return binary(node as jsep.BinaryExpression, refs);
    case "UnaryExpression":
      return unary(node as jsep.UnaryExpression, refs);
    default:
      throw new ConditionError(`${node.type} is not allowed in a condition`);
  }
}

/** Parse and check an expression; throws ConditionError when it is invalid or not allowed. */
export function compileCondition(expression: string): CompiledCondition {
  if (expression.trim() === "") throw new ConditionError("The expression is empty");
  let ast: jsep.Expression;
  try {
    ast = jsep(expression);
  } catch (err) {
    throw new ConditionError(err instanceof Error ? err.message : "Invalid expression");
  }
  const refs = new Set<string>();
  const program = build(ast, refs);
  return { refs, evaluate: (scope) => truthy(program(scope)) };
}
