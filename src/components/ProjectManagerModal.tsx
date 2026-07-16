import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, FilePlus, Copy, Trash2, X, Server, Search, ChevronDown, Download, Upload, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import { SavedProject, ProjectData } from '../types/project';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from "../utils/firestoreError";
import {
  compressData,
  decompressData,
  compressProject,
  decompressProject,
  decompressProjectList,
  compressProjectList,
  cleanFirestoreDataCycleSafe
} from '../utils/projectCompression';
import { getInstitutionsForType } from '../utils/institutionLibrary';
import { SYSTEM_VOLTAGES } from '../constants';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectData: ProjectData;
  onLoadProject: (id: string, data: ProjectData) => void;
  onNewProject: (configOverrides?: Partial<import("../types").PanelConfig>) => void;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
}

const STORAGE_KEY = 'electricalph_projects';

export default function ProjectManagerModal({ 
  isOpen, 
  onClose, 
  currentProjectData, 
  onLoadProject, 
  onNewProject,
  currentProjectId,
  setCurrentProjectId
}: ProjectManagerModalProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [saveName, setSaveName] = useState('');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState<Partial<import("../types").PanelConfig>>({
    projectType: 'Residential',
    institution: '',
    customInstitutionName: '',
    project: 'NEW PROJECT',
    owner: '',
    location: '',
    voltageSystem: '230V, 1PH, 2W',
    frequency: 60,
    utilityProvider: '',
    designStandard: 'PEC 2017',
    engineer: '',
    date: new Date().toISOString().split('T')[0]
  });
  
  const [filterType, setFilterType] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState('');
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [isModalDropdownOpen, setIsModalDropdownOpen] = useState(false);

  // Project Import/Export State Variables
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  interface ImportConflict {
    existingProject: SavedProject;
    incomingProject: SavedProject;
    file: File;
  }
  const [importConflict, setImportConflict] = useState<ImportConflict | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filteredProjects = projects
    .filter(p => {
      const matchesType = filterType === "All" || p.data?.panel?.projectType === filterType;
      const searchLower = searchQuery.toLowerCase();
      const projName = p.name?.toLowerCase() || '';
      const projType = p.data?.panel?.projectType?.toLowerCase() || '';
      const instName = p.data?.panel?.institution === 'Custom...'
        ? (p.data?.panel?.customInstitutionName?.toLowerCase() || '')
        : (p.data?.panel?.institution?.toLowerCase() || '');
      
      const matchesSearch = projName.includes(searchLower) || projType.includes(searchLower) || instName.includes(searchLower);
      return matchesType && matchesSearch;
    })
    .sort((a, b) => b.lastModified - a.lastModified);

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmId(null);
      setShowNewConfirm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const user = auth.currentUser;

    if (!user) {
      // Fallback to localStorage if no user is authenticated
      const loadGuestProjects = async () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        let loadedProjects: SavedProject[] = [];
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            loadedProjects = await decompressProjectList(parsed);
            setProjects(loadedProjects);
          } catch (e) {
            console.error("Failed to parse saved projects", e);
          }
        }

        if (currentProjectId) {
          const current = loadedProjects.find(p => p.id === currentProjectId);
          setSaveName(current ? current.name : (currentProjectData.panel.project || ''));
        } else {
          setSaveName(currentProjectData.panel.project || '');
        }
      };
      loadGuestProjects();
      return;
    }

    // Sync with Firestore
    const projectsRef = collection(db, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(projectsRef, async (snapshot) => {
      const rawProjects: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        rawProjects.push({
          id: docSnap.id,
          name: data.name,
          lastModified: data.lastModified,
          data: data.data,
        });
      });
      const loadedProjects = await decompressProjectList(rawProjects);
      setProjects(loadedProjects);

      if (currentProjectId) {
        const current = loadedProjects.find(p => p.id === currentProjectId);
        setSaveName(current ? current.name : (currentProjectData.panel.project || ''));
      } else {
        setSaveName(currentProjectData.panel.project || '');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/projects`);
    });

    return () => unsubscribe();
  }, [isOpen, currentProjectId, currentProjectData.panel.project]);

  const cleanData = (obj: any): any => {
    return cleanFirestoreDataCycleSafe(obj);
  };

  const saveToStorage = async (newProjects: SavedProject[], projectToUpdate?: SavedProject) => {
    // Always update local state and localStorage backup instantly to guarantee offline reliability
    try {
      const compressedList = await compressProjectList(newProjects);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compressedList));
    } catch (e) {
      console.error("Failed to write projects to localStorage:", e);
    }
    setProjects(newProjects);

    const user = auth.currentUser;
    if (user && projectToUpdate) {
      const docRef = doc(db, 'users', user.uid, 'projects', projectToUpdate.id);
      try {
        const payload: any = {
          name: projectToUpdate.name,
          lastModified: projectToUpdate.lastModified,
          data: projectToUpdate.data,
          ownerId: user.uid
        };
        const compressed = await compressProject(payload);
        await setDoc(docRef, compressed);
      } catch (error) {
        console.error("Manual save to Firestore failed:", error);
        try {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/projects/${projectToUpdate.id}`);
        } catch (e) {
          // Prevent re-throwing
        }
      }
    }
  };

  const handleSave = () => {
    const finalName = saveName.trim() || 'Untitled Project';
    const updatedData = {
      ...currentProjectData,
      panel: {
        ...currentProjectData.panel,
        project: finalName
      }
    };

    const projectExists = projects.some(p => p.id === currentProjectId);
    if (currentProjectId && projectExists) {
      const updatedProject = {
        id: currentProjectId,
        name: finalName,
        lastModified: Date.now(),
        data: updatedData
      };
      
      const updated = projects.map(p => 
        p.id === currentProjectId ? updatedProject : p
      );
      
      saveToStorage(updated, updatedProject);
      onLoadProject(currentProjectId, updatedData);
      onClose();
    } else {
      handleSaveAs(finalName);
    }
  };

  const handleSaveAs = (name: string) => {
    const finalName = name.trim() || 'Untitled Project';
    const updatedData = {
      ...currentProjectData,
      panel: {
        ...currentProjectData.panel,
        project: finalName
      }
    };
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newProject: SavedProject = {
      id: newId,
      name: finalName,
      lastModified: Date.now(),
      data: updatedData
    };
    
    saveToStorage([...projects, newProject], newProject);
    setCurrentProjectId(newId);
    onLoadProject(newId, updatedData);
    setSaveName('');
    onClose();
  };

  const handleLoad = (p: SavedProject) => {
    onLoadProject(p.id, p.data);
    onClose();
  };

  const confirmDelete = async (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    
    const user = auth.currentUser;
    if (user) {
      const docRef = doc(db, 'users', user.uid, 'projects', id);
      try {
        await deleteDoc(docRef);
      } catch (error) {
         handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/projects/${id}`);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setProjects(updated);
    }

    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
    setDeleteConfirmId(null);
  };

  const confirmNew = () => {
    if (!newProjectForm.projectType) {
      alert("Project Type is required.");
      return;
    }
    if (!newProjectForm.institution) {
      alert("Institution is required.");
      return;
    }
    if (newProjectForm.institution === 'Custom...' && (!newProjectForm.customInstitutionName || !newProjectForm.customInstitutionName.trim())) {
      alert("Custom Institution Name is required.");
      return;
    }
    if (!newProjectForm.project || !newProjectForm.project.trim()) {
      alert("Project Name is required.");
      return;
    }
    setCurrentProjectId(null);
    onNewProject(newProjectForm);
    onClose();
    setShowNewConfirm(false);
  };

  // ESTIMATED COMPRESSED SIZE OF THE PROJECT
  const getEstimatedCompressedSize = (p: SavedProject) => {
    try {
      const jsonStr = JSON.stringify(p);
      const bytes = new TextEncoder().encode(jsonStr).length;
      const estBytes = Math.ceil(bytes * 0.18); // Gzip ratio is ~15-20% for JSON texts
      if (estBytes < 1024) return `${estBytes} B`;
      return `${(estBytes / 1024).toFixed(1)} KB`;
    } catch {
      return 'N/A';
    }
  };

  // COMPRESS / BUNDLE PROJECT FOR BACKUP (.ephproj)
  const compressProject = async (project: SavedProject): Promise<Blob> => {
    const exportPayload = {
      fileType: 'electricalph_project_backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        lastModified: project.lastModified,
        data: project.data,
      },
    };

    const jsonString = JSON.stringify(exportPayload);

    if (typeof window.CompressionStream !== 'undefined') {
      try {
        const stream = new Blob([jsonString], { type: 'application/json' }).stream();
        const compressedStream = stream.pipeThrough(new window.CompressionStream('gzip'));
        const response = new Response(compressedStream);
        const blob = await response.blob();
        return blob;
      } catch (e) {
        console.warn("Native CompressionStream failed, falling back to uncompressed", e);
      }
    }
    return new Blob([jsonString], { type: 'application/json' });
  };

  // DECOMPRESS UPLOADED PROJECT FILE
  const decompressProjectFile = async (file: File): Promise<any> => {
    if (typeof window.DecompressionStream !== 'undefined') {
      try {
        const decompressedStream = file.stream().pipeThrough(new window.DecompressionStream('gzip'));
        const response = new Response(decompressedStream);
        const text = await response.text();
        return JSON.parse(text);
      } catch (e) {
        console.warn("Native DecompressionStream failed, reading as raw text", e);
      }
    }
    const text = await file.text();
    return JSON.parse(text);
  };

  // VALIDATE PROJECT FILE FORMAT & STRUCTURAL INTEGRITY
  const validateImportedProject = (parsed: any): boolean => {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.fileType !== 'electricalph_project_backup') return false;
    if (!parsed.project || typeof parsed.project !== 'object') return false;
    
    const p = parsed.project;
    if (typeof p.id !== 'string' || !p.id) return false;
    if (typeof p.name !== 'string' || !p.name) return false;
    if (typeof p.lastModified !== 'number') return false;
    if (!p.data || typeof p.data !== 'object') return false;
    
    const d = p.data;
    if (!d.panel || typeof d.panel !== 'object') return false;
    if (!Array.isArray(d.circuits)) return false;
    if (!Array.isArray(d.subPanels)) return false;
    
    return true;
  };

  // EXPORT ACTION HANDLER
  const handleDownloadProject = async (p: SavedProject) => {
    setDownloadingId(p.id);
    try {
      // Simulate small packing latency to demonstrate the beautiful visual indicator
      await new Promise(resolve => setTimeout(resolve, 750));
      const blob = await compressProject(p);
      const safeName = p.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const fileName = `${safeName || 'project'}.ephproj`;
      saveAs(blob, fileName);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export project.");
    } finally {
      setDownloadingId(null);
    }
  };

  // PROCESS THE UPLOADED BACKUP FILE
  const processImportFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      setUploadProgress(40);
      
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'ephproj' && ext !== 'electricalph') {
        alert("Unsupported file format. Please upload a .ephproj or .electricalph file.");
        setIsUploading(false);
        return;
      }

      const parsed = await decompressProjectFile(file);
      setUploadProgress(70);
      await new Promise(resolve => setTimeout(resolve, 200));

      if (!validateImportedProject(parsed)) {
        alert("The project file is corrupted, incomplete, or invalid.");
        setIsUploading(false);
        return;
      }

      setUploadProgress(100);
      await new Promise(resolve => setTimeout(resolve, 250));
      setIsUploading(false);

      const importedProj = parsed.project;
      
      const existing = projects.find(p => p.id === importedProj.id);
      if (existing) {
        setImportConflict({
          existingProject: existing,
          incomingProject: importedProj,
          file: file
        });
        setRenameValue(`${importedProj.name} (Copy)`);
      } else {
        await saveImportedProjectDirectly(importedProj);
        alert(`Successfully imported "${importedProj.name}"!`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to import project. Please verify that the file is not corrupted.");
      setIsUploading(false);
    }
  };

  // EXPLICIT FILE BUTTON SELECTION
  const handleFileImportClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImportFile(file);
    }
    e.target.value = '';
  };

  // DRAG & DROP GESTURE RECOGNIZERS
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processImportFile(file);
    }
  };

  // PERSIST IMPORTED DATA TO STORE (LOCAL & CLOUD)
  const saveImportedProjectDirectly = async (importedProj: SavedProject) => {
    const updatedProjects = [...projects.filter(p => p.id !== importedProj.id), importedProj];
    await saveToStorage(updatedProjects, importedProj);
  };

  // CONFLICT STRATEGY ACTIONS
  const handleResolveReplace = async () => {
    if (!importConflict) return;
    const { incomingProject } = importConflict;
    incomingProject.lastModified = Date.now();
    await saveImportedProjectDirectly(incomingProject);
    setImportConflict(null);
    alert(`Replaced existing project with "${incomingProject.name}".`);
  };

  const handleResolveDuplicate = async () => {
    if (!importConflict) return;
    const { incomingProject } = importConflict;
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
    const duplicated: SavedProject = {
      id: newId,
      name: `${incomingProject.name} (Copy)`,
      lastModified: Date.now(),
      data: {
        ...incomingProject.data,
        panel: {
          ...incomingProject.data.panel,
          project: `${incomingProject.name} (Copy)`
        }
      }
    };
    const updatedProjects = [...projects, duplicated];
    await saveToStorage(updatedProjects, duplicated);
    setImportConflict(null);
    alert(`Imported as duplicate: "${duplicated.name}".`);
  };

  const handleResolveRename = async () => {
    if (!importConflict) return;
    const { incomingProject } = importConflict;
    const finalName = renameValue.trim() || `${incomingProject.name} (Copy)`;
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
    const renamed: SavedProject = {
      id: newId,
      name: finalName,
      lastModified: Date.now(),
      data: {
        ...incomingProject.data,
        panel: {
          ...incomingProject.data.panel,
          project: finalName
        }
      }
    };
    const updatedProjects = [...projects, renamed];
    await saveToStorage(updatedProjects, renamed);
    setImportConflict(null);
    alert(`Imported and renamed to "${finalName}".`);
  };

  const handleResolveCancel = () => {
    setImportConflict(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-indigo-500" />
            Project Management
          </h2>
          <div className="flex items-center gap-4">
            {auth.currentUser ? (
              <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 rounded-lg flex items-center gap-1">
                <Save className="w-3 h-3" /> Cloud Sync Active
              </span>
            ) : (
              <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg flex items-center gap-1">
                <Server className="w-3 h-3" /> Local Storage
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="p-6 flex-1 overflow-y-auto space-y-6 relative"
        >
          {isDragging && (
            <div className="absolute inset-0 bg-indigo-600/15 backdrop-blur-sm border-2 border-dashed border-indigo-500 m-2 rounded-2xl flex flex-col items-center justify-center z-40 animate-fade-in pointer-events-none">
              <Upload className="w-12 h-12 text-indigo-500 mb-2 animate-bounce" />
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 px-4 py-2 rounded-xl shadow-lg border border-indigo-100 dark:border-indigo-950">
                Drop your `.ephproj` file here to import!
              </p>
            </div>
          )}

          {/* Current Project Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Current Project</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input 
                type="text" 
                placeholder="Project Name..." 
                value={saveName} 
                onChange={e => setSaveName(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white outline-none focus:border-indigo-500"
              />
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={handleSave} 
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button 
                  onClick={() => handleSaveAs(saveName)} 
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <Copy className="w-4 h-4" /> Save As
                </button>
                <button 
                  onClick={() => setShowNewConfirm(true)} 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <FilePlus className="w-4 h-4" /> New
                </button>
              </div>
            </div>
          </div>
 
          {/* Saved Projects List */}
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between md:justify-start gap-4">
                <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Saved Projects</h3>
                <label className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm select-none">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Project</span>
                  <input
                    type="file"
                    accept=".ephproj,.electricalph"
                    onChange={handleFileImportClick}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex gap-2 flex-1 md:flex-initial">
                <div className="relative flex-1 sm:w-60">
                  <input
                    type="text"
                    placeholder="Search name, type, or institution..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white outline-none focus:border-indigo-500"
                  />
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <select 
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white outline-none"
                >
                  <option value="All">All Types</option>
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
            </div>
            {filteredProjects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No saved projects found.</p>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleLoad(p)}
                    className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between hover:border-indigo-500 cursor-pointer transition-all bg-white dark:bg-slate-800/50 group"
                  >
                    <div>
                      <h4 className={`font-bold flex items-center flex-wrap gap-2 ${currentProjectId === p.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>
                        {p.name}
                        {p.data?.panel?.projectType && (
                          <span className="text-[9px] uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {p.data.panel.projectType}
                          </span>
                        )}
                        {p.data?.panel?.institution && (
                          <span className="text-[9px] uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100/50 dark:border-indigo-900/50">
                            {p.data.panel.institution === 'Custom...' ? (p.data.panel.customInstitutionName || 'Custom') : p.data.panel.institution}
                          </span>
                        )}
                        {currentProjectId === p.id && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">Current</span>}
                      </h4>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 items-center mt-1">
                         <p className="text-xs text-slate-500">
                           Last modified: {new Date(p.lastModified).toLocaleString()}
                         </p>
                         <p className="text-xs text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 rounded-md">
                           {p.data?.circuits?.length || 0} Circuits {p.data?.subPanels && p.data.subPanels.length > 0 ? `• ${p.data.subPanels.length} Sub-Panels` : ''}
                         </p>
                         <p className="text-[10px] text-slate-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/25 text-indigo-600/90 dark:text-indigo-400/90 px-2 rounded-md">
                           File Size: ~{getEstimatedCompressedSize(p)}
                         </p>
                      </div>
                    </div>
                    {deleteConfirmId === p.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded-lg uppercase tracking-wider">Are you sure?</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(p.id);
                          }}
                          className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-550 font-bold text-white rounded-lg transition-colors shadow-sm"
                        >
                          Delete
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-250 dark:hover:bg-slate-600 font-bold text-slate-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadProject(p);
                          }}
                          disabled={downloadingId === p.id}
                          className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors disabled:opacity-50"
                          title={`Download Project (${getEstimatedCompressedSize(p)})`}
                        >
                          {downloadingId === p.id ? (
                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(p.id);
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Custom Confirmation Overlay for New Project Initialization */}
        {showNewConfirm && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-fade-in my-auto">
              <div className="flex items-center gap-3 text-emerald-500">
                <FilePlus className="w-6 h-6" />
                <h4 className="font-bold text-slate-800 dark:text-white text-lg">Create New Project</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                Define the core attributes of your new project. The selected Project Type will automatically influence calculations, templates, and design standards.
              </p>
              
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Project Type *</label>
                    <select 
                      value={newProjectForm.projectType}
                      onChange={e => {
                        setNewProjectForm({
                          ...newProjectForm,
                          projectType: e.target.value,
                          institution: '',
                          customInstitutionName: ''
                        });
                        setModalSearchTerm('');
                        setIsModalDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white outline-none focus:border-indigo-500"
                      required
                    >
                      <option value="Residential">Residential</option>
                      <option value="Commercial">Commercial</option>
                      <option value="Industrial">Industrial</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2 relative">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Institution *</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => newProjectForm.projectType && setIsModalDropdownOpen(!isModalDropdownOpen)}
                        disabled={!newProjectForm.projectType}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white text-left flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed outline-none focus:border-indigo-500 border-solid"
                      >
                        <span className="truncate">
                          {newProjectForm.institution ? (
                            newProjectForm.institution === 'Custom...' ? (
                              newProjectForm.customInstitutionName ? `Custom: ${newProjectForm.customInstitutionName}` : 'Custom...'
                            ) : newProjectForm.institution
                          ) : 'Select Institution...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      </button>

                      {isModalDropdownOpen && newProjectForm.projectType && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
                          <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                            <input
                              type="text"
                              placeholder="Search institution..."
                              value={modalSearchTerm}
                              onChange={e => setModalSearchTerm(e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-250 dark:border-slate-600 rounded text-xs dark:text-white outline-none focus:border-indigo-500"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 py-1 max-h-48">
                            {getInstitutionsForType(newProjectForm.projectType)
                              .filter(inst => inst.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                              .map(inst => (
                                <button
                                  key={inst}
                                  type="button"
                                  onClick={() => {
                                    setNewProjectForm({
                                      ...newProjectForm,
                                      institution: inst,
                                      customInstitutionName: inst === 'Custom...' ? '' : undefined
                                    });
                                    setIsModalDropdownOpen(false);
                                    setModalSearchTerm('');
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-200 transition-colors"
                                >
                                  {inst}
                                </button>
                              ))}
                            {getInstitutionsForType(newProjectForm.projectType)
                              .filter(inst => inst.toLowerCase().includes(modalSearchTerm.toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-xs text-slate-500 text-center">No matching institutions found</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {newProjectForm.institution === 'Custom...' && (
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Custom Institution Name *</label>
                      <input
                        type="text"
                        value={newProjectForm.customInstitutionName || ''}
                        onChange={e => setNewProjectForm({...newProjectForm, customInstitutionName: e.target.value})}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white outline-none focus:border-indigo-500"
                        placeholder="e.g. Data Center"
                        required
                      />
                    </div>
                  )}
                  
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Project Name *</label>
                    <input 
                      type="text"
                      value={newProjectForm.project}
                      onChange={e => setNewProjectForm({...newProjectForm, project: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                      required
                      placeholder="e.g. Skyline Apartments"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Owner</label>
                    <input 
                      type="text"
                      value={newProjectForm.owner}
                      onChange={e => setNewProjectForm({...newProjectForm, owner: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                      placeholder="Owner Name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Location</label>
                    <input 
                      type="text"
                      value={newProjectForm.location}
                      onChange={e => setNewProjectForm({...newProjectForm, location: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                      placeholder="Project Address"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Voltage System</label>
                    <select 
                      value={newProjectForm.voltageSystem || '230V, 1PH, 2W'}
                      onChange={e => setNewProjectForm({...newProjectForm, voltageSystem: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    >
                      {Object.keys(SYSTEM_VOLTAGES).map((system) => (
                        <option key={system} value={system}>
                          {system}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Frequency (Hz)</label>
                    <select 
                      value={newProjectForm.frequency}
                      onChange={e => setNewProjectForm({...newProjectForm, frequency: Number(e.target.value)})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    >
                      <option value={60}>60 Hz</option>
                      <option value={50}>50 Hz</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Utility Provider</label>
                    <input 
                      type="text"
                      value={newProjectForm.utilityProvider}
                      onChange={e => setNewProjectForm({...newProjectForm, utilityProvider: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                      placeholder="e.g. MERALCO"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Design Standard</label>
                    <input 
                      type="text"
                      value={newProjectForm.designStandard}
                      onChange={e => setNewProjectForm({...newProjectForm, designStandard: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Engineer</label>
                    <input 
                      type="text"
                      value={newProjectForm.engineer}
                      onChange={e => setNewProjectForm({...newProjectForm, engineer: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Date</label>
                    <input 
                      type="date"
                      value={newProjectForm.date}
                      onChange={e => setNewProjectForm({...newProjectForm, date: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowNewConfirm(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-750 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmNew}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-550 text-white rounded-lg text-xs font-bold transition-colors shadow-md"
                >
                  Create Project
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Conflict Resolution Dialog */}
        {importConflict && (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-fade-in my-auto">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-500 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800 dark:text-white">Project Already Exists</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    A project named <span className="font-semibold text-slate-700 dark:text-slate-200">"{importConflict.existingProject.name}"</span> with the same ID already exists in your workspace. How would you like to handle this conflict?
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {/* Option 1: Replace */}
                <button
                  onClick={handleResolveReplace}
                  className="w-full p-3 border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 rounded-xl flex items-center gap-3 text-left transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40 group cursor-pointer"
                >
                  <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center group-hover:border-amber-500 group-hover:bg-amber-500 text-white shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white">Replace Existing Project</div>
                    <div className="text-[10px] text-slate-500">Overwrite current data. This action is permanent.</div>
                  </div>
                </button>

                {/* Option 2: Duplicate */}
                <button
                  onClick={handleResolveDuplicate}
                  className="w-full p-3 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-xl flex items-center gap-3 text-left transition-all hover:bg-slate-50 dark:hover:bg-slate-800/40 group cursor-pointer"
                >
                  <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center group-hover:border-indigo-500 group-hover:bg-indigo-500 text-white shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-white">Create a Duplicate Copy</div>
                    <div className="text-[10px] text-slate-500">Creates a new copy named "{importConflict.incomingProject.name} (Copy)" with a new ID.</div>
                  </div>
                </button>

                {/* Option 3: Rename */}
                <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center text-white shrink-0">
                      <div className="w-2 h-2 rounded-full bg-slate-350 dark:bg-slate-750" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-white font-sans">Rename and Import</div>
                      <div className="text-[10px] text-slate-500">Provide a new unique name for the project.</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New name..."
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-850 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleResolveRename}
                      disabled={!renameValue.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Rename
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleResolveCancel}
                  className="px-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel Import
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Processing Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xs w-full p-6 shadow-2xl flex flex-col items-center space-y-4 animate-fade-in">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-full" />
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <Upload className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-center">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Analyzing Project File</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">Verifying data integrity & calculations...</p>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full transition-all duration-350" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{uploadProgress}% Complete</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
