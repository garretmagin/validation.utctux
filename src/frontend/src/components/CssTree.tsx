import React, { useState, useCallback } from "react";
import "./CssTree.css";

export interface TreeViewProps<T> {
  items: T[];
  getChildren: (item: T) => T[];
  renderContent: (item: T, depth: number, hasChildren: boolean) => React.ReactNode;
  className?: string;
  /** Controlled mode: external collapsed state */
  collapsedNodes?: Set<string>;
  /** Controlled mode: external toggle handler */
  onToggle?: (key: string) => void;
}

function TreeNodes<T>({
  items,
  getChildren,
  renderContent,
  collapsedNodes,
  onToggle,
  pathPrefix = "",
}: {
  items: T[];
  getChildren: (item: T) => T[];
  renderContent: (item: T, depth: number, hasChildren: boolean) => React.ReactNode;
  collapsedNodes: Set<string>;
  onToggle: (key: string) => void;
  pathPrefix?: string;
}) {
  if (items.length === 0) return null;
  const depth = pathPrefix ? pathPrefix.split("-").length : 0;
  return (
    <ul>
      {items.map((item, i) => {
        const key = pathPrefix ? `${pathPrefix}-${i}` : `${i}`;
        const children = getChildren(item);
        const hasChildren = children.length > 0;
        const isExpanded = !collapsedNodes.has(key);
        return (
          <li key={key}>
            {hasChildren && (
              <button
                className="tree-toggle"
                onClick={(e) => { e.stopPropagation(); onToggle(key); }}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? "−" : "+"}
              </button>
            )}
            {renderContent(item, depth, hasChildren)}
            {isExpanded && hasChildren && (
              <TreeNodes
                items={children}
                getChildren={getChildren}
                renderContent={renderContent}
                collapsedNodes={collapsedNodes}
                onToggle={onToggle}
                pathPrefix={key}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function TreeView<T>({
  items,
  getChildren,
  renderContent,
  className,
  collapsedNodes: externalCollapsed,
  onToggle: externalToggle,
}: TreeViewProps<T>) {
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(new Set());

  const internalToggle = useCallback((key: string) => {
    setInternalCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapsedNodes = externalCollapsed ?? internalCollapsed;
  const toggleNode = externalToggle ?? internalToggle;

  return (
    <div className={`css-tree${className ? ` ${className}` : ""}`}>
      <TreeNodes
        items={items}
        getChildren={getChildren}
        renderContent={renderContent}
        collapsedNodes={collapsedNodes}
        onToggle={toggleNode}
      />
    </div>
  );
}
