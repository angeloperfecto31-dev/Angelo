import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, FilePlus, Copy, Trash2, X } from 'lucide-react';
import { SavedProject, ProjectData } from '../types/project';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProjectData: ProjectData;
  onLoadProject: (id: string, data: ProjectData) => void;
  onNewProject: () => void;
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

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirmId(null);
      setShowNewConfirm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(STORAGE_KEY);
      let loadedProjects: SavedProject[] = [];
      if (saved) {
        try {
          loadedProjects = JSON.parse(saved);
          setProjects(loadedProjects);
        } catch (e) {
          console.error("Failed to parse saved projects", e);
        }
      }

      // Initialize saveName once when modal opens
      if (currentProjectId) {
        const current = loadedProjects.find(p => p.id === currentProjectId);
        setSaveName(current ? current.name : (currentProjectData.panel.project || ''));
      } else {
        setSaveName(currentProjectData.panel.project || '');
      }
    }
  }, [isOpen]);

  const saveToStorage = (newProjects: SavedProject[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProjects));
    setProjects(newProjects);
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
      const updated = projects.map(p => 
        p.id === currentProjectId ? { ...p, name: finalName, lastModified: Date.now(), data: updatedData } : p
      );
      saveToStorage(updated);
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
    const newId = crypto.randomUUID();
    const newProject: SavedProject = {
      id: newId,
      name: finalName,
      lastModified: Date.now(),
      data: updatedData
    };
    saveToStorage([...projects, newProject]);
    setCurrentProjectId(newId);
    onLoadProject(newId, updatedData);
    setSaveName('');
    onClose();
  };

  const handleLoad = (p: SavedProject) => {
    onLoadProject(p.id, p.data);
    onClose();
  };

  const confirmDelete = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    saveToStorage(updated);
    if (currentProjectId === id) {
      setCurrentProjectId(null);
    }
    setDeleteConfirmId(null);
  };

  const confirmNew = () => {
    setCurrentProjectId(null);
    onNewProject();
    onClose();
    setShowNewConfirm(false);
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
          <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6 relative">
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
              <div className="flex gap-2">
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
            <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Saved Projects</h3>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No saved projects found.</p>
            ) : (
              <div className="space-y-2">
                {projects.sort((a, b) => b.lastModified - a.lastModified).map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleLoad(p)}
                    className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between hover:border-indigo-500 cursor-pointer transition-all bg-white dark:bg-slate-800/50 group"
                  >
                    <div>
                      <h4 className={`font-bold ${currentProjectId === p.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>
                        {p.name}
                        {currentProjectId === p.id && <span className="ml-2 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">Current</span>}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Last modified: {new Date(p.lastModified).toLocaleString()}
                      </p>
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
                      <div className="flex gap-2">
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
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 text-amber-500">
                <FilePlus className="w-6 h-6" />
                <h4 className="font-bold text-slate-800 dark:text-white">Create New Project?</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Any unsaved manual adjustments in your current project will be replaced. Are you sure you want to initialize a new blank workspace?
              </p>
              <div className="flex justify-end gap-2.5 pt-2">
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
                  Yes, New Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
