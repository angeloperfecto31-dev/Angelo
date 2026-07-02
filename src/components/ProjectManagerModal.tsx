import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, FilePlus, Copy, Trash2, X, Server } from 'lucide-react';
import { SavedProject, ProjectData } from '../types/project';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from "../utils/firestoreError";

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

  const filteredProjects = projects
    .filter(p => filterType === "All" || p.data.panel?.projectType === filterType)
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

      if (currentProjectId) {
        const current = loadedProjects.find(p => p.id === currentProjectId);
        setSaveName(current ? current.name : (currentProjectData.panel.project || ''));
      } else {
        setSaveName(currentProjectData.panel.project || '');
      }
      return;
    }

    // Sync with Firestore
    const projectsRef = collection(db, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(projectsRef, (snapshot) => {
      const loadedProjects: SavedProject[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        loadedProjects.push({
          id: docSnap.id,
          name: data.name,
          lastModified: data.lastModified,
          data: data.data,
        });
      });
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
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanData);
    const result: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = cleanData(obj[key]);
      }
    }
    return result;
  };

  const saveToStorage = async (newProjects: SavedProject[], projectToUpdate?: SavedProject) => {
    const user = auth.currentUser;
    if (!user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProjects));
      setProjects(newProjects);
      return;
    }

    if (projectToUpdate) {
      const docRef = doc(db, 'users', user.uid, 'projects', projectToUpdate.id);
      try {
        await setDoc(docRef, cleanData({
          name: projectToUpdate.name,
          lastModified: projectToUpdate.lastModified,
          data: projectToUpdate.data,
          ownerId: user.uid
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/projects/${projectToUpdate.id}`);
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
    if (!newProjectForm.project || !newProjectForm.projectType) {
      alert("Project Name and Project Type are required.");
      return;
    }
    setCurrentProjectId(null);
    onNewProject(newProjectForm);
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
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Saved Projects</h3>
              <select 
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs dark:text-white"
              >
                <option value="All">All Types</option>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Industrial">Industrial</option>
              </select>
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
                      <h4 className={`font-bold flex items-center gap-2 ${currentProjectId === p.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>
                        {p.name}
                        {p.data.panel?.projectType && (
                          <span className="text-[9px] uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {p.data.panel.projectType}
                          </span>
                        )}
                        {currentProjectId === p.id && <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">Current</span>}
                      </h4>
                      <div className="flex gap-4 items-center">
                         <p className="text-xs text-slate-500 mt-1">
                           Last modified: {new Date(p.lastModified).toLocaleString()}
                         </p>
                         <p className="text-xs text-slate-400 mt-1 font-medium bg-slate-100 dark:bg-slate-700/50 px-2 rounded-md">
                           {p.data.circuits?.length || 0} Circuits {p.data.subPanels && p.data.subPanels.length > 0 ? `• ${p.data.subPanels.length} Sub-Panels` : ''}
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
                      onChange={e => setNewProjectForm({...newProjectForm, projectType: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                      required
                    >
                      <option value="Residential">Residential</option>
                      <option value="Commercial">Commercial</option>
                      <option value="Industrial">Industrial</option>
                    </select>
                  </div>
                  
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
                    <input 
                      type="text"
                      value={newProjectForm.voltageSystem}
                      onChange={e => setNewProjectForm({...newProjectForm, voltageSystem: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm dark:text-white"
                    />
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
      </div>
    </div>
  );
}
