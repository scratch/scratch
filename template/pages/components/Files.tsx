import React, { useState } from "react";

// Tree node structure from parsing
interface TreeNode {
  id: string;
  name: string;
  comment?: string;
  children: TreeNode[];
  startCollapsed: boolean;
}

// Flattened node for rendering
interface RenderNode {
  id: string;
  name: string;
  comment?: string;
  depth: number;
  isLast: boolean;
  parentIsLast: boolean[];
  isFolder: boolean;
  hasChildren: boolean;
}

function parseTree(text: string): TreeNode[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse lines - support both whitespace and dash-prefix for indentation
  const items = lines.map((line, index) => {
    const dashMatch = line.match(/^(-+)/);
    let name: string;
    let indent: number;
    let comment: string | undefined;

    if (dashMatch) {
      name = line.slice(dashMatch[1].length);
      indent = dashMatch[1].length;
    } else {
      name = line.trim();
      indent = line.length - line.trimStart().length;
    }

    // Check for # comment
    const commentMatch = name.match(/\s*#\s*(.*)$/);
    if (commentMatch) {
      comment = commentMatch[1].trim();
      name = name.slice(0, commentMatch.index).trim();
    }

    // Check for (collapsed) suffix
    const collapsedMatch = name.match(/\s*\(collapsed\)\s*$/i);
    const startCollapsed = !!collapsedMatch;
    if (collapsedMatch) {
      name = name.slice(0, collapsedMatch.index).trim();
    }

    return { name, indent, comment, startCollapsed, lineIndex: index };
  });

  // Normalize indents by subtracting the minimum
  const baseIndent = Math.min(...items.map((item) => item.indent));
  items.forEach((item) => (item.indent -= baseIndent));

  // Build tree using a stack
  const roots: TreeNode[] = [];
  const stack: { node: TreeNode; indent: number }[] = [];

  for (const { name, indent, comment, startCollapsed, lineIndex } of items) {
    const node: TreeNode = {
      id: `node-${lineIndex}`,
      name,
      comment,
      children: [],
      startCollapsed,
    };

    // Pop stack until we find the parent (item with smaller indent)
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, indent });
  }

  return roots;
}

function flattenTree(
  roots: TreeNode[],
  collapsedIds: Set<string>
): RenderNode[] {
  const result: RenderNode[] = [];

  function traverse(
    nodes: TreeNode[],
    depth: number,
    parentIsLast: boolean[]
  ): void {
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const isFolder = node.name.endsWith("/");
      const hasChildren = node.children.length > 0;

      result.push({
        id: node.id,
        name: node.name,
        comment: node.comment,
        depth,
        isLast,
        parentIsLast: [...parentIsLast],
        isFolder,
        hasChildren,
      });

      // Only traverse children if not collapsed
      if (hasChildren && !collapsedIds.has(node.id)) {
        traverse(node.children, depth + 1, [...parentIsLast, isLast]);
      }
    });
  }

  traverse(roots, 0, []);
  return result;
}

function getInitialCollapsed(roots: TreeNode[]): Set<string> {
  const collapsed = new Set<string>();

  function traverse(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (node.startCollapsed) {
        collapsed.add(node.id);
      }
      traverse(node.children);
    }
  }

  traverse(roots);
  return collapsed;
}

interface FileRowProps {
  node: RenderNode;
  isCollapsed: boolean;
  onToggle: () => void;
}

function FileRow({ node, isCollapsed, onToggle }: FileRowProps) {
  const isClickable = node.isFolder;
  const isDotfile = node.name.startsWith(".");

  return (
    <div className="flex items-center h-7 font-mono text-sm">
      {/* Left side: indent + caret + name */}
      <div
        className="flex items-center w-52 flex-shrink-0"
        style={{ paddingLeft: `${node.depth * 1}rem` }}
      >
        {/* Caret for folders */}
        {isClickable ? (
          <button
            onClick={onToggle}
            className="w-4 flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isCollapsed ? "" : "rotate-90"}
            >
              <path d="M2 1L6 4L2 7" />
            </svg>
          </button>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}

        <span
          className={`flex items-center ${
            isDotfile
              ? "text-gray-400"
              : node.isFolder
                ? "text-gray-500 font-bold"
                : "text-gray-600"
          } ${isClickable ? "cursor-pointer hover:text-gray-800 select-none" : ""}`}
          onClick={isClickable ? onToggle : undefined}
        >
          {node.name}
        </span>
      </div>

      {/* Right side: comment */}
      {node.comment && (
        <span className="text-gray-400 font-normal whitespace-nowrap">
          {node.comment}
        </span>
      )}
    </div>
  );
}

function extractText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";

  if (Array.isArray(children)) {
    return children.map(extractText).join("\n");
  }

  if (typeof children === "object" && "props" in children) {
    const el = children as React.ReactElement;
    if (el.type === "p" || el.type === "br") {
      return extractText(el.props.children) + "\n";
    }
    return extractText(el.props.children);
  }

  return "";
}

interface FilesProps {
  content?: string;
  children?: React.ReactNode;
}

export default function Files({ content, children }: FilesProps) {
  const text = content ?? extractText(children);
  const [tree] = useState(() => parseTree(text));
  const [collapsedIds, setCollapsedIds] = useState(() =>
    getInitialCollapsed(tree)
  );

  const nodes = flattenTree(tree, collapsedIds);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="not-prose my-6 py-4 px-4 overflow-x-auto">
      {nodes.map((node) => (
        <FileRow
          key={node.id}
          node={node}
          isCollapsed={collapsedIds.has(node.id)}
          onToggle={() => toggleCollapse(node.id)}
        />
      ))}
    </div>
  );
}
