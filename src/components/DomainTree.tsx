import { Checkbox } from '@consta/uikit/Checkbox';
import { Text } from '@consta/uikit/Text';
import { IconArrowRight } from '@consta/icons/IconArrowRight';
import React, { useMemo, useState } from 'react';
import type { DomainNode } from '../data';
import styles from './DomainTree.module.css';
import clsx from 'clsx';

type DomainTreeProps = {
  tree: DomainNode[];
  selected: Set<string>;
  descendants: Map<string, string[]>;
  onToggle: (domainId: string) => void;
};

type TreeItemProps = {
  node: DomainNode;
  selected: Set<string>;
  descendants: Map<string, string[]>;
  onToggle: (id: string) => void;
  depth?: number;
};

const TreeItem: React.FC<TreeItemProps> = ({ node, selected, descendants, onToggle, depth = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  
  // Indentation logic: 24px for expand button + (depth * 24px) indent
  const paddingLeft = depth * 16;

  const cascade = useMemo(() => descendants.get(node.id) ?? [node.id], [descendants, node.id]);
  const isChecked = useMemo(() => cascade.every((id) => selected.has(id)), [cascade, selected]);
  const isIntermediate = useMemo(
    () => !isChecked && cascade.some((id) => selected.has(id)),
    [cascade, isChecked, selected]
  );

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className={styles.item}>
      <div className={clsx(styles.row, { [styles.expanded]: isExpanded })}>
        <div 
            className={styles.expandButton} 
            style={{ marginLeft: paddingLeft }}
            onClick={hasChildren ? handleToggleExpand : undefined}
        >
          {hasChildren && (
            <IconArrowRight size="xs" className={styles.expandIcon} />
          )}
        </div>
        
        <div className={styles.checkboxWrapper} onClick={() => onToggle(node.id)}>
            <Checkbox
                checked={isChecked}
                intermediate={isIntermediate}
                size="s"
                onChange={() => {}} // Handled by wrapper div
                label={
                    <div className={styles.leafLabel}>
                        <Text size="s" lineHeight="m">
                            {node.name}
                        </Text>
                        {node.description && (
                            <Text size="xs" view="secondary" lineHeight="s">
                                {node.description}
                            </Text>
                        )}
                    </div>
                }
            />
        </div>
      </div>
      
      {hasChildren && isExpanded && (
        <div className={styles.children}>
            {node.children?.map((child) => (
                <TreeItem
                    key={child.id}
                    node={child}
                    selected={selected}
                    descendants={descendants}
                    onToggle={onToggle}
                    depth={depth + 1}
                />
            ))}
        </div>
      )}
    </div>
  );
};

const DomainTree: React.FC<DomainTreeProps> = ({ tree, selected, descendants, onToggle }) => {
  return (
    <div className={styles.tree}>
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          selected={selected}
          descendants={descendants}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
};

export default DomainTree;
