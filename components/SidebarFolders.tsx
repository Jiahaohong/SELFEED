import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder as FolderIcon, Pencil, Plus, Settings, Tag, TrendingUp, X } from 'lucide-react';
import { Folder, Keyword } from '../types';

interface SidebarFoldersProps {
  folders: Folder[];
  folderLinks: { folderId: string; keywordId: string }[];
  keywords: Keyword[];
  selectedKind: 'folder' | 'keyword-folder' | 'keyword-global' | null;
  selectedId: string | null;
  onSelectFolder: (id: string) => void;
  onSelectFolderKeyword: (id: string) => void;
  onSelectGlobalKeyword: (id: string) => void;
  onAddKeyword: (folderId?: string | null) => void;
  onAddStockKeyword: (folderId?: string | null) => void;
  onAddFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameKeyword: (id: string, text: string) => void;
  onEditStockKeyword: (keyword: Keyword) => void;
  onDeleteKeyword: (id: string) => void;
  onMoveKeyword: (keywordId: string, folderId: string | null) => void;
  onOpenSettings: () => void;
}

type ContextMenuState =
  | { type: 'folder'; id: string; x: number; y: number }
  | { type: 'keyword'; id: string; x: number; y: number };

const SidebarFolders: React.FC<SidebarFoldersProps> = ({
  folders,
  folderLinks,
  keywords,
  selectedKind,
  selectedId,
  onSelectFolder,
  onSelectFolderKeyword,
  onSelectGlobalKeyword,
  onAddKeyword,
  onAddStockKeyword,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onRenameKeyword,
  onEditStockKeyword,
  onDeleteKeyword,
  onMoveKeyword,
  onOpenSettings
}) => {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editing, setEditing] = useState<{ type: 'folder' | 'keyword'; id: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const keywordsByFolder = useMemo(() => {
    const keywordMap = new Map(keywords.map(keyword => [keyword.id, keyword]));
    const map = new Map<string, Keyword[]>();
    const seen = new Set<string>();
    folderLinks.forEach(link => {
      const keyword = keywordMap.get(link.keywordId);
      if (!keyword) return;
      const dedupeKey = `${link.folderId}:${link.keywordId}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      if (!map.has(link.folderId)) {
        map.set(link.folderId, []);
      }
      map.get(link.folderId)?.push(keyword);
    });
    map.forEach(list => list.sort((a, b) => a.text.localeCompare(b.text)));
    return map;
  }, [folderLinks, keywords]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handlePointerDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handlePointerDown, true);
    };
  }, [contextMenu]);

  const toggleFolder = (id: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const beginRenameFolder = (folder: Folder) => {
    setEditing({ type: 'folder', id: folder.id });
    setEditingValue(folder.name);
    setContextMenu(null);
  };

  const beginRenameKeyword = (keyword: Keyword) => {
    setEditing({ type: 'keyword', id: keyword.id });
    setEditingValue(keyword.text);
    setContextMenu(null);
  };

  const beginKeywordEdit = (keyword: Keyword) => {
    if (keyword.kind === 'stock') {
      onEditStockKeyword(keyword);
      setContextMenu(null);
      return;
    }
    beginRenameKeyword(keyword);
  };

  const commitRename = () => {
    if (!editing) return;
    const nextValue = editingValue.trim();
    if (!nextValue) {
      setEditing(null);
      setEditingValue('');
      return;
    }
    if (editing.type === 'folder') {
      onRenameFolder(editing.id, nextValue);
    } else {
      onRenameKeyword(editing.id, nextValue);
    }
    setEditing(null);
    setEditingValue('');
  };

  const cancelRename = () => {
    setEditing(null);
    setEditingValue('');
  };

  const renderKeywordRow = (keyword: Keyword, depth: number, variant: 'folder' | 'global') => {
    const isSelected = variant === 'folder'
      ? selectedKind === 'keyword-folder' && selectedId === keyword.id
      : selectedKind === 'keyword-global' && selectedId === keyword.id;
    const isEditing = editing?.type === 'keyword' && editing.id === keyword.id;

    return (
      <div
        key={keyword.id}
        className={`group w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 cursor-pointer ${
          isSelected
            ? 'bg-yellow-400/20 text-yellow-900 font-semibold'
            : 'hover:bg-gray-200/50 text-gray-700'
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          if (variant === 'folder') {
            onSelectFolderKeyword(keyword.id);
          } else {
            onSelectGlobalKeyword(keyword.id);
          }
        }}
        draggable
        onDragStart={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('button')) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData('text/plain', keyword.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (variant === 'folder') {
            onSelectFolderKeyword(keyword.id);
          } else {
            onSelectGlobalKeyword(keyword.id);
          }
          setContextMenu({ type: 'keyword', id: keyword.id, x: event.clientX, y: event.clientY });
        }}
      >
        <div className="w-3 h-3" />
        {keyword.kind === 'stock' ? (
          <TrendingUp size={16} className="text-note-yellow" />
        ) : (
          <Tag size={16} className="text-note-yellow" />
        )}
        {isEditing ? (
          <input
            autoFocus
            value={editingValue}
            onChange={(event) => setEditingValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitRename();
              }
              if (event.key === 'Escape') {
                cancelRename();
              }
            }}
            className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-0.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-note-yellow/40"
          />
        ) : (
          <span className="truncate flex-1 min-w-0">{keyword.text}</span>
        )}
        {!isEditing ? (
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600"
              title="重命名"
              draggable={false}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                beginKeywordEdit(keyword);
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-red-500"
              title="删除"
              draggable={false}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteKeyword(keyword.id);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderFolderRow = (folder: Folder) => {
    const children = keywordsByFolder.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isEditing = editing?.type === 'folder' && editing.id === folder.id;
    const isSelected = selectedKind === 'folder' && selectedId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`group w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors duration-200 cursor-pointer ${
            isSelected ? 'bg-yellow-400/10 text-yellow-900 font-semibold' : 'text-gray-700 hover:bg-gray-200/50'
          }`}
          onClick={() => onSelectFolder(folder.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ type: 'folder', id: folder.id, x: event.clientX, y: event.clientY });
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const keywordId = event.dataTransfer.getData('text/plain');
            if (!keywordId) return;
            onMoveKeyword(keywordId, folder.id);
            setExpandedFolderIds(prev => {
              const next = new Set(prev);
              next.add(folder.id);
              return next;
            });
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="w-3 h-3 flex items-center justify-center text-gray-400 hover:text-gray-600 -mr-1"
              onClick={(event) => {
                event.stopPropagation();
                toggleFolder(folder.id);
              }}
              aria-label={isExpanded ? '收起文件夹' : '展开文件夹'}
            >
              <ChevronRight
                size={12}
                className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <div className="w-3 h-3 -mr-1" />
          )}
          <FolderIcon size={16} className="text-note-yellow" />
          {isEditing ? (
            <input
              autoFocus
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitRename();
                }
                if (event.key === 'Escape') {
                  cancelRename();
                }
              }}
              className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-0.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-note-yellow/40"
            />
          ) : (
            <span className="flex-1 text-left truncate cursor-pointer">{folder.name}</span>
          )}
          {!isEditing ? (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                className="p-1 text-gray-400 hover:text-gray-600"
                title="重命名"
                draggable={false}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  beginRenameFolder(folder);
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="p-1 text-gray-400 hover:text-red-500"
                title="删除"
                draggable={false}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {hasChildren && isExpanded ? (
          <div className="space-y-[1px]">
            {children.map(keyword => renderKeywordRow(keyword, 1, 'folder'))}
          </div>
        ) : null}
      </div>
    );
  };

  const allKeywords = useMemo(
    () => [...keywords].sort((a, b) => a.text.localeCompare(b.text)),
    [keywords]
  );

  return (
    <div className="flex flex-col h-full bg-gray-50/90 backdrop-blur-xl border-r border-gray-200 w-full flex-shrink-0 transition-all duration-300 relative z-30">
      <div className="h-12 flex items-center justify-between px-4 font-medium text-gray-500 text-sm select-none">
        <span>关键词</span>
        <button
          type="button"
          className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center"
          title="设置"
          onClick={onOpenSettings}
        >
          <Settings size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-[1px] py-2">
        {folders.map(folder => renderFolderRow(folder))}
        {allKeywords.length > 0 ? (
          <div className="pt-2">
            <div className="px-3 text-[11px] text-gray-400 uppercase tracking-wide">全部关键词</div>
            <div className="space-y-[1px] mt-1">
              {allKeywords.map(keyword => renderKeywordRow(keyword, 0, 'global'))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-gray-200 px-4 py-2 space-y-2">
        <button
          onClick={onAddFolder}
          className="w-full flex items-center gap-2 text-gray-500 hover:text-note-yellow transition-colors text-sm font-medium"
        >
          <div className="bg-gray-200 rounded-full p-0.5">
            <Plus size={14} />
          </div>
          新建文件夹
        </button>
        <button
          onClick={() => onAddStockKeyword(null)}
          className="w-full flex items-center gap-2 text-gray-500 hover:text-note-yellow transition-colors text-sm font-medium"
        >
          <div className="bg-gray-200 rounded-full p-0.5">
            <TrendingUp size={14} />
          </div>
          新建股票关键词
        </button>
        <button
          onClick={() => onAddKeyword(null)}
          className="w-full flex items-center gap-2 text-gray-500 hover:text-note-yellow transition-colors text-sm font-medium"
        >
          <div className="bg-gray-200 rounded-full p-0.5">
            <Plus size={14} />
          </div>
          新建关键词
        </button>
      </div>

      {contextMenu ? (
        <div
          ref={menuRef}
          className="fixed z-[1000] min-w-[180px] rounded-xl border border-gray-200 bg-white/90 backdrop-blur-xl shadow-xl p-1 text-[12px] text-gray-700"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.type === 'folder' ? (
            <>
              <button
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100/80 transition-colors"
                onClick={() => {
                  const folder = folders.find(item => item.id === contextMenu.id);
                  if (folder) beginRenameFolder(folder);
                }}
              >
                重命名文件夹
              </button>
              <button
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100/80 transition-colors"
                onClick={() => {
                  setContextMenu(null);
                  onAddKeyword(contextMenu.id);
                  setExpandedFolderIds(prev => {
                    const next = new Set(prev);
                    next.add(contextMenu.id);
                    return next;
                  });
                }}
              >
                新建关键词
              </button>
              <button
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                onClick={() => {
                  setContextMenu(null);
                  onDeleteFolder(contextMenu.id);
                }}
              >
                删除文件夹
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-100/80 transition-colors"
                onClick={() => {
                  const keyword = keywords.find(item => item.id === contextMenu.id);
                  if (keyword) beginKeywordEdit(keyword);
                }}
              >
                重命名关键词
              </button>
              <button
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                onClick={() => {
                  setContextMenu(null);
                  onDeleteKeyword(contextMenu.id);
                }}
              >
                删除关键词
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SidebarFolders;
