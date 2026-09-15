import React, { useState, useEffect } from 'react';
import {
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  ArrowLeft,
  Search,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  MoreVertical,
  CheckSquare,
  Square,
  Plus,
  Edit3,
  X as XIcon,
  ExternalLink,
  Eye,
  Loader2,
  HardDrive,
  Grid,
  List as ListIcon,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTheme } from '../context/ThemeContext';
import { StorageUsageBar } from './ui/StorageUsageBar';
import { ref, listAll, getMetadata, deleteObject, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  doc,
  updateDoc,
  increment,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { storage, db, auth } from '../firebase';

interface StorageItem {
  name: string;
  path: string;
  type: string;
  size?: number;
  updated?: string;
  isImage?: boolean;
  displayName?: string; // Resolved student name
}

export const StorageExplorer: React.FC = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [items, setItems] = useState<{ folders: StorageItem[], files: StorageItem[] }>({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [previewItem, setPreviewItem] = useState<StorageItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // --- 1. Load Student Names for ID Resolution ---
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const userSnap = await getDocs(collection(db, 'users'));
        const mapping: Record<string, string> = {};
        userSnap.docs.forEach(d => {
          const data = d.data();
          const uid = d.id.trim();
          mapping[uid] = data.displayName || data.userName || data.email || uid;
        });
        setUserMap(mapping);
      } catch (e) {
        console.warn("User name mapping failed:", e);
      }
    };
    loadUsers();
  }, []);

  const updateMetrics = async (bytesChange: number) => {
    const metricsRef = doc(db, 'system', 'storage_metrics');
    try {
      await updateDoc(metricsRef, {
        totalBytesUsed: increment(bytesChange)
      });
    } catch (e) {
      // If doc doesn't exist, initialize it
      await setDoc(metricsRef, { totalBytesUsed: Math.max(0, bytesChange) }, { merge: true });
    }
  };

  // ─── Metrics Synchronisation Engine ───
  const syncStorageMetrics = async () => {
    const t = toast.loading('Synchronising bucket metrics...');
    try {
      let totalBytes = 0;
      const calculateSize = async (prefix: string) => {
        const storageRef = ref(storage, prefix);
        const res = await listAll(storageRef);

        // Add file sizes
        for (const item of res.items) {
          const meta = await getMetadata(item);
          totalBytes += meta.size;
        }

        // Recurse into folders
        for (const folder of res.prefixes) {
          await calculateSize(folder.fullPath);
        }
      };

      await calculateSize(''); // Start from root
      const metricsRef = doc(db, 'system', 'storage_metrics');
      await setDoc(metricsRef, {
        totalBytesUsed: totalBytes,
        lastSyncedAt: serverTimestamp()
      }, { merge: true });

      toast.success(`Metrics synced: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB found.`, { id: t });
    } catch (err: any) {
      console.error('Sync Error:', err);
      toast.error('Sync failed: ' + err.message, { id: t });
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const cleanName = folderName.replace(/[^a-zA-Z0-9_-]/g, '');
    const t = toast.loading(`Creating virtual node: ${cleanName}`);
    try {
      // In Firebase Storage, folders don't technically exist without a file.
      // We create a hidden .keep file to instantiate the path.
      const placeholderRef = ref(storage, `${currentPrefix}${cleanName}/.keep`);
      await uploadBytes(placeholderRef, new Blob(['placeholder'], { type: 'text/plain' }));

      toast.success('Directory created', { id: t });
      fetchItems(currentPrefix);
    } catch (err: any) {
      toast.error('Failed to create folder: ' + err.message, { id: t });
    }
  };

  const handleRename = async (item: StorageItem) => {
    const newName = prompt(`Enter new name for ${item.type}:`, item.displayName || item.name);
    if (!newName || newName === (item.displayName || item.name)) return;

    const t = toast.loading(`Moving ${item.type} resources...`);
    try {
      if (item.type === 'folder') {
        // Recursive Folder Move (Copy all files + Delete originals)
        const oldPrefix = item.path;
        const newPrefix = item.path.replace(item.name.replace('/', ''), newName.replace('/', ''));

        const moveFolder = async (currentOldPath: string, currentNewPath: string) => {
          const list = await listAll(ref(storage, currentOldPath));
          // Move files
          for (const file of list.items) {
             const blob = await fetch(await getDownloadURL(file)).then(r => r.blob());
             const newFileRef = ref(storage, file.fullPath.replace(currentOldPath, currentNewPath));
             await uploadBytes(newFileRef, blob);
             await deleteObject(file);
          }
          // Recurse subfolders
          for (const folder of list.prefixes) {
            await moveFolder(folder.fullPath, folder.fullPath.replace(currentOldPath, currentNewPath));
          }
        };

        await moveFolder(oldPrefix, newPrefix);
      } else {
        // Simple File Move
        const oldRef = ref(storage, item.path);
        const newPath = item.path.replace(item.name, newName);
        const newRef = ref(storage, newPath);

        const blob = await fetch(await getDownloadURL(oldRef)).then(r => r.blob());
        await uploadBytes(newRef, blob);
        await deleteObject(oldRef);
      }

      toast.success('Rename complete', { id: t });
      fetchItems(currentPrefix);
    } catch (err: any) {
      toast.error('Rename failed: ' + err.message, { id: t });
    }
  };

  const fetchItems = async (prefix: string) => {
    setLoading(true);
    try {
      const storageRef = ref(storage, prefix);
      const res = await listAll(storageRef);

      const folders = res.prefixes.map(p => {
        const id = p.name.replace('/', '').trim();
        const name = userMap[id] || p.name;
        return {
          name: p.name + '/',
          displayName: userMap[id] ? `${userMap[id]} (${id.substring(0, 10)})/` : p.name + '/',
          path: p.fullPath + '/',
          type: 'folder'
        };
      });

      const fileItems = await Promise.all(res.items.map(async (item) => {
        const metadata = await getMetadata(item);
        return {
          name: item.name,
          path: item.fullPath,
          size: metadata.size,
          type: metadata.contentType || 'application/octet-stream',
          updated: metadata.updated,
          isImage: (metadata.contentType || '').startsWith('image/')
        };
      }));

      setItems({
        folders,
        files: fileItems
      });
      setSelectedPaths([]);
    } catch (err) {
      console.error('Storage list error:', err);
      toast.error('Failed to load storage items');
      setItems({ folders: [], files: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(currentPrefix);
  }, [currentPrefix, userMap]);

  const handleFolderClick = (path: string) => {
    setCurrentPrefix(path);
  };

  const handleBack = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    setCurrentPrefix(parts.length > 0 ? parts.join('/') + '/' : '');
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const toggleSelectAll = () => {
    const allPaths = [...items.folders.map(f => f.path), ...items.files.map(f => f.path)];
    if (selectedPaths.length === allPaths.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(allPaths);
    }
  };

  const handleDelete = async () => {
    if (selectedPaths.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedPaths.length} items? This includes all contents of selected folders.`)) return;

    const t = toast.loading(`Deleting ${selectedPaths.length} resources...`);
    try {
      let totalBytesDeleted = 0;

      const deleteRecursive = async (path: string) => {
        const storageRef = ref(storage, path);
        if (path.endsWith('/')) {
          // It's a folder prefix
          const list = await listAll(storageRef);
          for (const item of list.items) {
            const meta = await getMetadata(item);
            totalBytesDeleted += meta.size;
            await deleteObject(item);
          }
          for (const prefix of list.prefixes) {
            await deleteRecursive(prefix.fullPath + '/');
          }
        } else {
          // It's a file
          const meta = await getMetadata(storageRef);
          totalBytesDeleted += meta.size;
          await deleteObject(storageRef);
        }
      };

      await Promise.all(selectedPaths.map(path => deleteRecursive(path)));

      await updateMetrics(-totalBytesDeleted);
      toast.success('Resources deleted', { id: t });
      fetchItems(currentPrefix);
    } catch (err: any) {
      toast.error('Deletion failed: ' + err.message, { id: t });
    }
  };

  const openPreview = async (item: StorageItem) => {
    setPreviewItem(item);
    setLoadingUrl(true);
    try {
      const fileRef = ref(storage, item.path);
      const url = await getDownloadURL(fileRef);
      setPreviewUrl(url);
    } catch (err) {
      toast.error('Failed to get preview URL');
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const t = toast.loading(`Uploading ${files.length} files...`);

    try {
      let totalBytesUploaded = 0;
      await Promise.all(Array.from(files).map(async (file) => {
        const storageRef = ref(storage, currentPrefix + file.name);
        await uploadBytes(storageRef, file);
        totalBytesUploaded += file.size;
      }));

      await updateMetrics(totalBytesUploaded);
      toast.success('Upload complete', { id: t });
      fetchItems(currentPrefix);
    } catch (err) {
      toast.error('Upload failed', { id: t });
    } finally {
      setUploading(false);
    }
  };

  const handleBatchRename = async () => {
    if (selectedPaths.length === 0) return;
    const prefix = prompt('Enter prefix to add to selected files:');
    if (!prefix) return;

    const t = toast.loading(`Renaming ${selectedPaths.length} items...`);
    try {
      await Promise.all(selectedPaths.map(async (path) => {
        const fileRef = ref(storage, path);
        const fileName = path.split('/').pop() || '';
        const newPath = path.replace(fileName, `${prefix}${fileName}`);
        const newRef = ref(storage, newPath);

        const blob = await fetch(await getDownloadURL(fileRef)).then(r => r.blob());
        await uploadBytes(newRef, blob);
        await deleteObject(fileRef);
      }));

      toast.success('Batch rename complete', { id: t });
      fetchItems(currentPrefix);
    } catch (err: any) {
      toast.error('Batch rename failed: ' + err.message, { id: t });
    }
  };

  const formatSize = (bytes: number | undefined) => {
    if (bytes === undefined) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const breadcrumbs = currentPrefix.split('/').filter(Boolean);

  return (
    <div className="space-y-6">
      <StorageUsageBar onSyncRequest={syncStorageMetrics} />

      <div className={`rounded-3xl border shadow-2xl overflow-hidden ${
        isDark ? 'bg-[#0D111A] border-slate-200 dark:border-zinc-800' : 'bg-white border-slate-200'
      }`}>
        {/* Header / Toolbar */}
        <div className={`p-6 border-b flex items-center justify-between gap-4 ${isDark ? 'dark:border-zinc-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-4 flex-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPrefix('')}
                  className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 transition-colors"
                >
                  gs://basechanfunder.firebasestorage.app
                </button>
                {breadcrumbs.map((part, i) => (
                  <React.Fragment key={i}>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <button
                      onClick={() => setCurrentPrefix(breadcrumbs.slice(0, i + 1).join('/') + '/')}
                      className={`text-[10px] font-black uppercase tracking-widest truncate max-w-[120px] ${
                        i === breadcrumbs.length - 1 ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
             {/* 🖴 Sync Metrics Button (More Prominent) */}
             <button
               onClick={syncStorageMetrics}
               className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 shadow-sm'}`}
             >
               <HardDrive className="w-4 h-4" />
               <span className="text-[10px] font-black uppercase tracking-widest">Recalculate Storage</span>
             </button>

             <div className={`flex items-center p-1 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
               <button
                 onClick={() => setViewMode('list')}
                 className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? (isDark ? 'bg-white/10 text-white' : 'bg-white text-blue-600 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}
               >
                 <ListIcon className="w-4 h-4" />
               </button>
               <button
                 onClick={() => setViewMode('grid')}
                 className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? (isDark ? 'bg-white/10 text-white' : 'bg-white text-blue-600 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}
               >
                 <Grid className="w-4 h-4" />
               </button>
             </div>

             <div className="relative">
                <button
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD RESOURCE</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isAddMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={`absolute right-0 top-full mt-2 w-48 rounded-2xl shadow-2xl z-[150] p-1.5 border ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}
                    >
                      <button
                        onClick={() => { document.getElementById('file-upload')?.click(); setIsAddMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <File className="w-3.5 h-3.5" />
                        <span>Upload Files</span>
                      </button>
                      <button
                        onClick={() => { document.getElementById('folder-upload')?.click(); setIsAddMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <Folder className="w-3.5 h-3.5" />
                        <span>Upload Folder</span>
                      </button>
                      <button
                        onClick={() => { handleCreateFolder(); setIsAddMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>New Folder</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
             </div>

             <button
               onClick={() => fetchItems(currentPrefix)}
               className={`p-2.5 rounded-xl border transition-all ${isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900'}`}
             >
               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
             </button>

             <input
               id="file-upload"
               type="file"
               multiple
               className="hidden"
               onChange={handleUpload}
             />
             <input
               id="folder-upload"
               type="file"
               multiple
               // @ts-ignore
               webkitdirectory=""
               className="hidden"
               onChange={handleUpload}
             />
          </div>
        </div>

        {/* Selection Action Bar */}
        <AnimatePresence>
          {selectedPaths.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-blue-600 px-6 py-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase text-white tracking-widest">
                  {selectedPaths.length} Items Selected
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBatchRename}
                  className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-2"
                >
                   <Edit3 className="w-3 h-3" />
                   <span>Bulk Rename</span>
                </button>
                <button className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-2">
                   <Download className="w-3 h-3" />
                   <span>Export ZIP</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white rounded-lg font-black text-[9px] uppercase tracking-widest transition-all flex items-center gap-2"
                >
                   <Trash2 className="w-3 h-3" />
                   <span>Delete Selected</span>
                </button>
                <button
                  onClick={() => setSelectedPaths([])}
                  className="p-1.5 text-white/60 hover:text-white"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explorer Area */}
        <div className="min-h-[400px] relative">
          {loading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Scanning Bucket...</p>
              </div>
            </div>
          )}

          {viewMode === 'list' ? (
            <div className="w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500 border-white/5' : 'text-slate-400 border-slate-100'} border-b`}>
                    <th className="px-6 py-4 w-12">
                      <button onClick={toggleSelectAll} className="hover:text-blue-500 transition-colors">
                        {selectedPaths.length > 0 && selectedPaths.length === items.files.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Size</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Last modified</th>
                    <th className="px-6 py-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {currentPrefix !== '' && (
                    <tr onClick={handleBack} className="hover:bg-white/5 cursor-pointer group transition-colors">
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 flex items-center gap-3">
                        <ArrowLeft className="w-4 h-4 text-blue-500" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">.. / Back</span>
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  )}

                  {items.folders?.map(folder => {
                    const isSelected = selectedPaths.includes(folder.path);
                    return (
                      <tr
                        key={folder.path}
                        className={`hover:bg-white/5 cursor-pointer group transition-colors ${isSelected ? 'bg-blue-600/5' : ''}`}
                      >
                        <td className="px-6 py-4" onClick={(e) => { e.stopPropagation(); toggleSelect(folder.path); }}>
                           <div className={`${isSelected ? 'text-blue-500' : 'text-slate-700 hover:text-slate-500'} cursor-pointer`}>
                             {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                           </div>
                        </td>
                        <td className="px-6 py-4" onClick={() => handleFolderClick(folder.path)}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform`}>
                              <Folder className="w-4 h-4 fill-current opacity-60" />
                            </div>
                            <span className="text-[11px] font-black text-white uppercase tracking-tight">{folder.displayName || folder.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 font-mono">--</td>
                        <td className="px-6 py-4 text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Folder</td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 font-mono">--</td>
                        <td className="px-6 py-4">
                           <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRename(folder); }}
                                title="Rename Folder"
                                className="p-1.5 text-slate-500 hover:text-amber-500 transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete folder ${folder.name} and all its contents?`)) {
                                    const t = toast.loading('Deleting folder contents...');
                                    try {
                                      const deleteFolder = async (path: string) => {
                                        const list = await listAll(ref(storage, path));
                                        for (const file of list.items) {
                                          await deleteObject(file);
                                        }
                                        for (const sub of list.prefixes) {
                                          await deleteFolder(sub.fullPath);
                                        }
                                      };
                                      await deleteFolder(folder.path);
                                      toast.success('Folder purged', { id: t });
                                      fetchItems(currentPrefix);
                                    } catch (err: any) {
                                      toast.error('Purge failed: ' + err.message, { id: t });
                                    }
                                  }
                                }}
                                title="Delete Folder"
                                className="p-1.5 text-slate-500 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <ChevronRight className="w-4 h-4 text-slate-700" />
                           </div>
                        </td>
                      </tr>
                    );
                  })}

                  {items.files?.map(file => {
                    const isSelected = selectedPaths.includes(file.path);
                    return (
                      <tr
                        key={file.path}
                        className={`hover:bg-white/5 transition-colors group ${isSelected ? 'bg-blue-600/5' : ''}`}
                      >
                        <td className="px-6 py-4" onClick={(e) => { e.stopPropagation(); toggleSelect(file.path); }}>
                           <div className={`${isSelected ? 'text-blue-500' : 'text-slate-700 hover:text-slate-500'} cursor-pointer`}>
                             {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                           </div>
                        </td>
                        <td className="px-6 py-4" onClick={() => openPreview(file)}>
                          <div className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 text-slate-400 group-hover:text-white transition-colors`}>
                              {file.isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                            </div>
                            <span className="text-[11px] font-bold text-slate-300 truncate max-w-[200px] uppercase tracking-tight">{file.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-slate-400 font-mono">{formatSize(file.size)}</td>
                        <td className="px-6 py-4">
                           <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                             file.isImage ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                           }`}>
                             {file.type.split('/').pop()?.toUpperCase()}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 font-mono">
                           {file.updated ? new Date(file.updated).toLocaleDateString() : '--'}
                        </td>
                        <td className="px-6 py-4">
                           <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                              <button onClick={() => openPreview(file)} title="Preview" className="p-1.5 text-slate-500 hover:text-white transition-colors">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleRename(file)} title="Rename" className="p-1.5 text-slate-500 hover:text-amber-500 transition-colors">
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Delete ${file.name}?`)) {
                                    const t = toast.loading('Deleting...');
                                    await deleteObject(ref(storage, file.path));
                                    await updateMetrics(-(file.size || 0));
                                    toast.success('Deleted', { id: t });
                                    fetchItems(currentPrefix);
                                  }
                                }}
                                title="Delete"
                                className="p-1.5 text-slate-500 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  const url = await getDownloadURL(ref(storage, file.path));
                                  window.open(url, '_blank');
                                }}
                                title="Download"
                                className="p-1.5 text-slate-500 hover:text-white transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                           </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
             <div className="p-6 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
                {items.folders?.map(folder => {
                  const isSelected = selectedPaths.includes(folder.path);
                  return (
                    <div
                      key={folder.path}
                      onClick={() => handleFolderClick(folder.path)}
                      className="flex flex-col items-center gap-2 group cursor-pointer relative"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(folder.path); }}
                        className={`absolute top-0 right-0 p-1 z-10 ${isSelected ? 'text-blue-500' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 bg-slate-900 rounded" /> : <Square className="w-4 h-4 bg-slate-900 rounded" />}
                      </button>

                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                        isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10 text-blue-400' : 'bg-blue-500/10 text-blue-400 group-hover:scale-110'
                      }`}>
                        <Folder className="w-8 h-8 fill-current opacity-60" />
                      </div>
                      <span className="text-[9px] font-black text-slate-400 uppercase text-center truncate w-full px-1">{folder.displayName || folder.name}</span>

                      {/* Grid Action Overlay */}
                      <div className="absolute inset-0 bg-slate-950/80 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                         <button onClick={(e) => { e.stopPropagation(); handleRename(folder); }} className="p-1.5 bg-white/10 hover:bg-amber-500 rounded text-white transition-colors">
                           <Edit3 className="w-3.5 h-3.5" />
                         </button>
                         <button
                           onClick={async (e) => {
                             e.stopPropagation();
                             if (confirm(`Delete folder ${folder.name}?`)) {
                               const t = toast.loading('Deleting...');
                               // (Use existing delete recursive logic here or via handle)
                               await handleDelete(); // This will use the selected state
                             }
                           }}
                           className="p-1.5 bg-white/10 hover:bg-rose-500 rounded text-white transition-colors"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </div>
                  );
                })}

                {items.files?.map(file => {
                   const isSelected = selectedPaths.includes(file.path);
                   return (
                     <div
                      key={file.path}
                      onClick={() => openPreview(file)}
                      className="flex flex-col items-center gap-2 group cursor-pointer relative"
                     >
                       <button
                         onClick={(e) => { e.stopPropagation(); toggleSelect(file.path); }}
                         className={`absolute top-0 right-0 p-1 z-10 ${isSelected ? 'text-blue-500' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                       >
                         {isSelected ? <CheckSquare className="w-4 h-4 bg-slate-900 rounded" /> : <Square className="w-4 h-4 bg-slate-900 rounded" />}
                       </button>
                       <div className={`w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:scale-110 transition-all ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}`}>
                         {file.isImage ? <ImageIcon className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
                       </div>
                       <span className="text-[9px] font-black text-slate-400 uppercase text-center truncate w-full px-1">{file.name}</span>

                       <div className="absolute inset-0 bg-slate-950/80 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                          <button onClick={(e) => { e.stopPropagation(); openPreview(file); }} className="p-1.5 bg-white/10 hover:bg-blue-500 rounded text-white transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleRename(file); }} className="p-1.5 bg-white/10 hover:bg-amber-500 rounded text-white transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                       </div>
                     </div>
                   );
                })}
             </div>
          )}

          {!loading && items.folders.length === 0 && items.files.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-20 h-20 rounded-3xl bg-white/5 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-700 mb-4">
                 <Folder className="w-10 h-10" />
               </div>
               <h4 className="text-sm font-black uppercase text-slate-600 tracking-widest">Directory Empty</h4>
               <p className="text-[10px] text-slate-700 font-bold uppercase mt-1">No files found in this path</p>
            </div>
          )}
        </div>
      </div>

      {/* Preview Drawer */}
      <AnimatePresence>
        {previewItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setPreviewItem(null); setPreviewUrl(null); }}
              className="fixed inset-0 z-[1100] bg-slate-950/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 right-0 bottom-0 w-full max-w-xl z-[1200] shadow-2xl border-l flex flex-col ${
                isDark ? 'bg-[#0D111A] border-slate-200 dark:border-zinc-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-500">
                     {previewItem.isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                   </div>
                   <div className="min-w-0">
                     <h3 className="text-sm font-black text-white uppercase tracking-tight truncate max-w-[300px]">{previewItem.name}</h3>
                     <p className="text-[10px] text-slate-500 font-mono uppercase">{formatSize(previewItem.size)} • {previewItem.type}</p>
                   </div>
                </div>
                <button onClick={() => { setPreviewItem(null); setPreviewUrl(null); }} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <XIcon className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center bg-slate-950/30">
                {loadingUrl ? (
                   <div className="flex flex-col items-center gap-3">
                     <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                     <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Generating Token...</p>
                   </div>
                ) : previewUrl ? (
                  previewItem.isImage ? (
                    <div className="relative group">
                       <img src={previewUrl} alt={previewItem.name} className="max-w-full max-h-[60vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800" />
                       <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl backdrop-blur-[2px]">
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2">
                             <ExternalLink className="w-4 h-4" />
                             Full Screen
                          </a>
                       </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-6">
                       <div className="w-32 h-32 rounded-[2.5rem] bg-slate-800 flex items-center justify-center text-slate-600 shadow-2xl border border-slate-200 dark:border-zinc-800">
                         <FileText className="w-16 h-16" />
                       </div>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Document Preview Not Available</p>
                       <a
                         href={previewUrl}
                         download={previewItem.name}
                         className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-3"
                       >
                         <Download className="w-4 h-4" />
                         Download Document
                       </a>
                    </div>
                  )
                ) : (
                  <div className="text-center">
                    <p className="text-xs text-rose-500 font-bold uppercase">Error loading preview</p>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-slate-200 dark:border-zinc-800 bg-slate-900/20">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Storage Path</p>
                     <p className="text-[11px] text-slate-300 font-mono break-all">{previewItem.path}</p>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Modified</p>
                     <p className="text-[11px] text-slate-300 font-mono">{previewItem.updated ? new Date(previewItem.updated).toLocaleString() : '--'}</p>
                   </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
