import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { Rnd } from 'react-rnd'
import imageCompression from 'browser-image-compression'
import { Trash2, Edit2, ChevronLeft, ChevronRight, Play, Image as ImageIcon, Type, Save, LogOut, Plus, Folder, FileText, Settings, ArrowUp, ArrowDown, CheckCircle, AlertCircle, Move, RotateCcw, Bold, AlignLeft, AlignCenter, AlignRight, ArrowRight, Minus, Undo, Redo } from 'lucide-react'

// Feste Kino-Leinwandgröße (16:9) für pixelgenaue Darstellung
const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

const getPx = (val) => typeof val === 'number' ? `${val}px` : val;

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [folders, setFolders] = useState([])
  const [currentFolder, setCurrentFolder] = useState(null)
  const [draggedFolder, setDraggedFolder] = useState(null)

  const [showAddMenu, setShowAddMenu] = useState(false)
  const [editingFolder, setEditingFolder] = useState(null)
  const [nameDe, setNameDe] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('folder')
  const [customIconUrl, setCustomIconUrl] = useState('')
  const [isUploadingIcon, setIsUploadingIcon] = useState(false)
  const iconInputRef = useRef(null)

  const [activePresentation, setActivePresentation] = useState(null)
  const [slides, setSlides] = useState([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  // Historie für Undo / Redo
  const [history, setHistory] = useState([])
  const [historyStep, setHistoryStep] = useState(-1)

  const [isFullscreenMode, setIsFullscreenMode] = useState(false)
  const [scale, setScale] = useState(1)

  const [activeElementId, setActiveElementId] = useState(null)

  const [toast, setToast] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)

  const fileInputRef = useRef(null)
  const containerRef = useRef(null)
  const slidesRef = useRef(slides)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const requestConfirm = (message, onConfirm) => {
    setConfirmDialog({ message, onConfirm })
  }

  const enterFullscreenAndLandscape = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();

      if (window.screen.orientation && window.screen.orientation.lock) {
        await window.screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.warn("Fullscreen/Orientation API error:", err);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if (document.msExitFullscreen) await document.msExitFullscreen();
      }
      if (window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
    } catch (err) {
      console.warn("Exit Fullscreen API error:", err);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        setIsFullscreenMode(false);
        if (!session) setActivePresentation(null);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [session]);

  // Loading Screen Timer (4 Sekunden)
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!activePresentation) fetchFolders()
  }, [currentFolder, activePresentation])

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const scaleX = clientWidth / CANVAS_WIDTH;
        const scaleY = clientHeight / CANVAS_HEIGHT;
        setScale(Math.min(scaleX, scaleY) * 0.95);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activePresentation, isFullscreenMode]);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    if (!activePresentation || !session) return;
    const interval = setInterval(async () => {
      const currentSlides = slidesRef.current;
      const { error } = await supabase.from('folders').update({ slides: currentSlides }).eq('id', activePresentation.id);
      if (!error) console.log("Autosave erfolgreich");
    }, 60000);
    return () => clearInterval(interval);
  }, [activePresentation, session]);

  const fetchFolders = async () => {
    let query = supabase.from('folders').select('*')
    if (currentFolder === null) query = query.is('parent_id', null)
    else query = query.eq('parent_id', currentFolder.id)

    const { data } = await query.order('position_index', { ascending: true }).order('created_at', { ascending: true })
    if (data) setFolders(data)
  }

  const handleDragStart = (e, folder) => setDraggedFolder(folder)

  const handleDrop = async (e, targetFolder) => {
    e.preventDefault()
    if (!draggedFolder || draggedFolder.id === targetFolder.id) return

    const draggedIdx = folders.findIndex(f => f.id === draggedFolder.id)
    const targetIdx = folders.findIndex(f => f.id === targetFolder.id)

    const tempPos = folders[draggedIdx].position_index ?? draggedIdx
    const targetPos = folders[targetIdx].position_index ?? targetIdx

    const newFolders = [...folders]
    newFolders[draggedIdx] = { ...newFolders[draggedIdx], position_index: targetPos }
    newFolders[targetIdx] = { ...newFolders[targetIdx], position_index: tempPos }

    newFolders.sort((a, b) => (a.position_index ?? 0) - (b.position_index ?? 0))
    setFolders(newFolders)

    await supabase.from('folders').update({ position_index: targetPos }).eq('id', draggedFolder.id)
    await supabase.from('folders').update({ position_index: tempPos }).eq('id', targetFolder.id)

    setDraggedFolder(null)
  }

  const handleIconUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsUploadingIcon(true);
    let fileToUpload = file;
    try { fileToUpload = await imageCompression(file, { maxSizeMB: 0.1, maxWidthOrHeight: 200, useWebWorker: true }); }
    catch (error) { console.error(error); }

    const fileName = `icon_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage.from('media').upload(fileName, fileToUpload);

    if (uploadError) showToast("Fehler beim Hochladen: " + uploadError.message, 'error');
    else {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
      setCustomIconUrl(publicUrl);
    }
    setIsUploadingIcon(false);
    event.target.value = null;
  }

  const handleSaveButton = async (e) => {
    e.preventDefault()
    if (editingFolder) {
      const { error } = await supabase.from('folders').update({ name_de: nameDe, name_ar: nameAr, type: type, icon_url: customIconUrl }).eq('id', editingFolder.id)
      if (error) showToast("Fehler: " + error.message, 'error')
      else showToast("Erfolgreich aktualisiert!")
    } else {
      const newPos = folders.length > 0 ? (folders[folders.length - 1].position_index ?? folders.length) + 1 : 0;
      const { error } = await supabase.from('folders').insert([{ name_de: nameDe, name_ar: nameAr, type: type, parent_id: currentFolder ? currentFolder.id : null, icon_url: customIconUrl, position_index: newPos }])
      if (error) showToast("Fehler: " + error.message, 'error')
      else showToast("Erfolgreich erstellt!")
    }
    closeAddMenu()
    fetchFolders()
  }

  const deleteButton = async (e, folderId) => {
    e.stopPropagation()
    requestConfirm("Bist du sicher, dass du diesen Button und alle seine Inhalte löschen möchtest?", async () => {
      await supabase.from('folders').delete().eq('id', folderId)
      showToast("Erfolgreich gelöscht!")
      fetchFolders()
    })
  }

  const openEditMenu = (e, folder) => {
    e.stopPropagation()
    setEditingFolder(folder)
    setNameDe(folder.name_de)
    setNameAr(folder.name_ar)
    setType(folder.type)
    setCustomIconUrl(folder.icon_url || '')
    setShowAddMenu(true)
  }

  const closeAddMenu = () => {
    setShowAddMenu(false); setEditingFolder(null); setNameDe(''); setNameAr(''); setType('folder'); setCustomIconUrl('');
  }

  // --- UNDO / REDO LOGIK ---
  const updateSlidesState = (newSlides) => {
    setSlides(newSlides);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newSlides);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }

  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1);
      setSlides(history[historyStep - 1]);
      setActiveElementId(null);
    }
  }

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1);
      setSlides(history[historyStep + 1]);
      setActiveElementId(null);
    }
  }

  const openPresentation = async (folder) => {
    setActivePresentation(folder)
    const initialSlides = folder.slides || [{ id: Date.now(), elements: [] }];
    setSlides(initialSlides)
    setCurrentSlideIndex(0)
    setActiveElementId(null)

    setHistory([initialSlides])
    setHistoryStep(0)

    if (!session) {
      setIsFullscreenMode(true)
      await enterFullscreenAndLandscape()
    }
  }

  const savePresentation = async () => {
    const { error } = await supabase.from('folders').update({ slides: slides }).eq('id', activePresentation.id)
    if (error) showToast("Fehler beim Speichern!", 'error')
    else showToast("Präsentation erfolgreich gespeichert!")
  }

  const addSlide = () => {
    updateSlidesState([...slides, { id: Date.now(), elements: [] }])
    setCurrentSlideIndex(slides.length)
    setActiveElementId(null)
  }

  const duplicateSlide = (e, index) => {
    e.stopPropagation();
    const slideToCopy = slides[index];
    const newSlide = { ...slideToCopy, id: Date.now(), elements: slideToCopy.elements.map(el => ({ ...el, id: Date.now() + Math.random() })) };
    const newSlides = [...slides];
    newSlides.splice(index + 1, 0, newSlide);
    updateSlidesState(newSlides);
    setCurrentSlideIndex(index + 1);
  }

  const moveSlideUp = (e, index) => {
    e.stopPropagation();
    if (index === 0) return;
    const newSlides = [...slides];
    const temp = newSlides[index];
    newSlides[index] = newSlides[index - 1];
    newSlides[index - 1] = temp;
    updateSlidesState(newSlides);
    if (currentSlideIndex === index) setCurrentSlideIndex(index - 1);
    else if (currentSlideIndex === index - 1) setCurrentSlideIndex(index);
  }

  const moveSlideDown = (e, index) => {
    e.stopPropagation();
    if (index === slides.length - 1) return;
    const newSlides = [...slides];
    const temp = newSlides[index];
    newSlides[index] = newSlides[index + 1];
    newSlides[index + 1] = temp;
    updateSlidesState(newSlides);
    if (currentSlideIndex === index) setCurrentSlideIndex(index + 1);
    else if (currentSlideIndex === index + 1) setCurrentSlideIndex(index);
  }

  const deleteSlide = (e, index) => {
    e.stopPropagation()
    if (slides.length <= 1) return showToast("Die letzte Folie kann nicht gelöscht werden.", 'error')
    requestConfirm("Folie wirklich löschen?", () => {
      const newSlides = slides.filter((_, i) => i !== index)
      updateSlidesState(newSlides)
      setCurrentSlideIndex(Math.max(0, index - 1))
    })
  }

  const updateSlideElements = (newElements) => {
    const updatedSlides = [...slides];
    updatedSlides[currentSlideIndex] = { ...updatedSlides[currentSlideIndex], elements: newElements };
    updateSlidesState(updatedSlides);
  }

  const updateElementProps = (elementId, newProps) => {
    const currentElements = slides[currentSlideIndex].elements
    const newElements = currentElements.map(el => el.id === elementId ? { ...el, ...newProps } : el)
    updateSlideElements(newElements)
  }

  const deleteElement = async (elementId) => {
    const newElements = slides[currentSlideIndex].elements.filter(el => el.id !== elementId)
    updateSlideElements(newElements)
    setActiveElementId(null)
  }

  const addTextElement = () => {
    const newId = Date.now();
    const newElement = { id: newId, type: 'text', content: 'Neuer Text', x: 400, y: 300, width: 400, height: 100, fontSize: 40, color: '#E8C56C', backgroundColor: 'transparent', fontWeight: 'normal', textAlign: 'center', rotation: 0, animation: 'none', fontFamily: 'Georgia, serif' }
    updateSlideElements([...slides[currentSlideIndex].elements, newElement])
    setActiveElementId(newId)
  }

  const addShape = (shapeType) => {
    const newId = Date.now();
    const newElement = { id: newId, type: 'shape', shapeType: shapeType, x: 400, y: 300, width: 200, height: shapeType === 'line' ? 10 : 50, color: '#E8C56C', rotation: 0, animation: 'none' }
    updateSlideElements([...slides[currentSlideIndex].elements, newElement])
    setActiveElementId(newId)
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]; if (!file) return;
    setIsUploading(true); let fileToUpload = file;
    if (file.type.startsWith('image/')) {
      try { fileToUpload = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1920, useWebWorker: true }) } catch (error) { console.error(error) }
    }
    const fileName = `${Date.now()}.${file.name.split('.').pop()}`
    const { error: uploadError } = await supabase.storage.from('media').upload(fileName, fileToUpload)
    if (uploadError) { showToast("Fehler: " + uploadError.message, 'error'); setIsUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName)
    const newId = Date.now();
    const newElement = { id: newId, type: file.type.startsWith('video/') ? 'video' : 'image', src: publicUrl, x: 200, y: 100, width: 600, height: 400, rotation: 0, animation: 'none' }
    updateSlideElements([...slides[currentSlideIndex].elements, newElement])
    setActiveElementId(newId)
    setIsUploading(false); event.target.value = null
  }

  const renderContent = (el, isViewer) => {
    const commonStyle = { width: '100%', height: '100%', objectFit: 'fill' };

    let content = null;
    if (el.type === 'text') {
      content = (
        <textarea
          value={el.content}
          onChange={isViewer ? undefined : (e) => updateElementProps(el.id, { content: e.target.value })}
          readOnly={isViewer}
          style={{
            ...commonStyle,
            fontSize: `${el.fontSize}px`, color: el.color, fontFamily: el.fontFamily,
            fontWeight: el.fontWeight || 'normal', textAlign: el.textAlign || 'center',
            backgroundColor: el.backgroundColor || 'transparent', border: 'none', outline: 'none', resize: 'none',
            padding: '15px', margin: 0, lineHeight: 1.2,
            overflow: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word', boxSizing: 'border-box'
          }}
        />
      )
    } else if (el.type === 'image') {
      content = <img src={el.src} style={{ ...commonStyle, pointerEvents: 'none' }} draggable="false" />
    } else if (el.type === 'video') {
      content = <video src={el.src} controls={isViewer} style={{ ...commonStyle, pointerEvents: isViewer ? 'auto' : 'none' }} />
    } else if (el.type === 'shape') {
      if (el.shapeType === 'line') {
        content = <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}><div style={{ width: '100%', height: '4px', backgroundColor: el.color }}></div></div>
      } else if (el.shapeType === 'arrow') {
        content = <svg style={{ width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0,40 L70,40 L70,20 L100,50 L70,80 L70,60 L0,60 Z" fill={el.color} /></svg>
      }
    }

    return (
      <div style={{ width: '100%', height: '100%', transform: `rotate(${el.rotation || 0}deg)`, transformOrigin: 'center' }}>
        {content}
      </div>
    );
  }

  const globalStyles = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #05080F; color: #FFF9E6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; overflow-x: hidden; }
    
    textarea::-webkit-scrollbar { display: none; }
    textarea { -ms-overflow-style: none; scrollbar-width: none; overflow: hidden; }

    .glass-panel { background: rgba(16, 24, 40, 0.75); backdrop-filter: blur(12px); border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 16px; box-shadow: 0 10px 40px 0 rgba(0, 0, 0, 0.6); }
    .btn-glass { background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.4); color: #FFF9E6; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
    .btn-glass:hover:not(:disabled) { background: rgba(212, 175, 55, 0.25); transform: translateY(-2px); border-color: rgba(212, 175, 55, 0.9); box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3); }
    .btn-glass:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .folder-card { background: linear-gradient(145deg, #1E293B, #0B0F19); border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 20px; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); position: relative; overflow: hidden; box-shadow: 0 8px 25px rgba(0,0,0,0.6); }
    .folder-card:hover { transform: translateY(-5px); box-shadow: 0 15px 35px rgba(0,0,0,0.9), 0 0 20px rgba(212, 175, 55, 0.3); border-color: rgba(212, 175, 55, 0.8); }
    .folder-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 5px; background: linear-gradient(90deg, #b8860b, #f5d76e, #b8860b); opacity: 0; transition: opacity 0.3s; }
    .folder-card:hover::before { opacity: 1; }
    
    .text-gold { background: linear-gradient(to right, #BF953F, #FCF6BA, #B38728, #FBF5B7, #AA771C); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 0px 2px 4px rgba(0,0,0,0.5); padding-bottom: 8px; display: inline-block; line-height: 1.2; }

    .portrait-warning { display: none; background: linear-gradient(90deg, #BF953F, #FCF6BA); color: #05080F; text-align: center; padding: 10px; font-weight: bold; font-size: 0.9rem; zIndex: 9999; }
    @media (max-aspect-ratio: 1/1) { .portrait-warning { display: block; } }

    .mobile-rotate-overlay { display: none; }
    @media screen and (orientation: portrait) and (max-width: 768px) {
      .fullscreen-viewer-content { display: none !important; }
      .mobile-rotate-overlay.active { display: flex; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #05080F; z-index: 999999; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px; color: #f5d76e; }
    }

    @keyframes pulse-logo { 0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0)); } 50% { transform: scale(1.05); filter: drop-shadow(0 0 30px rgba(212, 175, 55, 0.8)); } 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(212, 175, 55, 0)); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes zoomIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    
    .anim-fadeIn { animation: fadeIn 1s ease forwards; }
    .anim-slideUp { animation: slideUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
    .anim-zoomIn { animation: zoomIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
  `

  const signature = (
    <div style={{ position: 'fixed', bottom: '10px', right: '15px', fontSize: '0.75rem', color: 'rgba(212, 175, 55, 0.4)', zIndex: 9999, pointerEvents: 'none', fontFamily: 'monospace' }}>
      Entwickelt von: Kiro Kolta
    </div>
  )

  const uiOverlays = (
    <>
      {toast && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', background: toast.type === 'error' ? 'rgba(220, 20, 60, 0.95)' : 'linear-gradient(to right, #BF953F, #FCF6BA)', color: toast.type === 'error' ? 'white' : '#05080F', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', animation: 'slideUp 0.3s ease-out' }}>
          {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span style={{ fontWeight: 'bold' }}>{toast.message}</span>
        </div>
      )}
      {confirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="anim-zoomIn glass-panel" style={{ padding: '30px', width: '350px', textAlign: 'center', background: '#0B0F19', border: '1px solid rgba(212, 175, 55, 0.5)' }}>
            <h3 style={{ marginTop: 0, color: '#f5d76e', fontSize: '1.2rem' }}>Bestätigung erforderlich</h3>
            <p style={{ color: '#FFF9E6', marginBottom: '25px' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={() => setConfirmDialog(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(212, 175, 55, 0.4)', color: '#FFF9E6', borderRadius: '6px', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} style={{ flex: 1, padding: '10px', background: '#dc143c', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'radial-gradient(circle at center, #1A233A 0%, #05080F 100%)' }}>
        <style>{globalStyles}</style>

        <div style={{ animation: 'pulse-logo 3s infinite', marginBottom: '30px', backgroundColor: '#fff', borderRadius: '50%', padding: '10px', boxShadow: '0 0 30px rgba(212, 175, 55, 0.4)' }}>
          <img src="/logo.png" alt="Koptisches Kirchenemblem" style={{ width: '220px', height: 'auto', objectFit: 'contain', borderRadius: '50%' }} />
        </div>

        <div style={{ animation: 'fadeInUp 2s ease forwards 1s', opacity: 0, textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: 'rgba(212, 175, 55, 0.7)', fontFamily: 'monospace', letterSpacing: '3px', margin: 0, fontSize: '0.9rem' }}>ENTWICKELT VON</p>
          <p style={{ color: '#f5d76e', fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '5px', margin: '5px 0 0 0', textShadow: '0 0 15px rgba(212,175,55,0.4)' }}>KIRO KOLTA</p>
          {/* Die neue Unterschrift der Kirche */}
          <p style={{ color: 'rgba(253, 251, 247, 0.6)', marginTop: '15px', fontSize: '0.9rem', letterSpacing: '1px' }}>Kirche der Hl. Maria und des Hl. Philopater Mercurius Unna</p>
        </div>

      </div>
    )
  }

  if (activePresentation) {
    const currentSlide = slides[currentSlideIndex]

    if (isFullscreenMode) {
      return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'black', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <style>{globalStyles}</style>

          <div className="mobile-rotate-overlay active">
            <RotateCcw size={64} style={{ marginBottom: '20px', animation: 'pulse-logo 2s infinite' }} />
            <h2 style={{ margin: '0 0 10px 0' }}>Bitte drehe dein Handy</h2>
            <p style={{ color: '#FFF9E6', marginBottom: '30px' }}>Die Präsentation wird nur im Querformat abgespielt.</p>
            <button onClick={async () => { await exitFullscreen(); setIsFullscreenMode(false); if (!session) setActivePresentation(null); }} className="btn-glass" style={{ padding: '12px 24px', fontSize: '1.1rem' }}>
              Abbrechen & Zurück
            </button>
          </div>

          <div className="fullscreen-viewer-content" style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>

            <button onClick={async () => { await exitFullscreen(); setIsFullscreenMode(false); if (!session) setActivePresentation(null); }} style={{ position: 'absolute', top: '20px', left: '20px', padding: '10px 20px', backgroundColor: 'rgba(212, 175, 55, 0.15)', color: '#E8C56C', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '30px', cursor: 'pointer', zIndex: 1000, backdropFilter: 'blur(5px)', transition: '0.3s' }} className="btn-glass">
              <ChevronLeft size={20} style={{ verticalAlign: 'middle', marginRight: '5px' }} /> {session ? 'Beenden' : 'Zurück'}
            </button>

            <div
              style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', zIndex: 50, cursor: currentSlideIndex > 0 ? 'pointer' : 'default' }}
              onClick={() => currentSlideIndex > 0 && setCurrentSlideIndex(prev => prev - 1)}
            />
            <div
              style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%', zIndex: 50, cursor: currentSlideIndex < slides.length - 1 ? 'pointer' : 'default' }}
              onClick={() => currentSlideIndex < slides.length - 1 && setCurrentSlideIndex(prev => prev + 1)}
            />

            <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              <div style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, minWidth: `${CANVAS_WIDTH}px`, minHeight: `${CANVAS_HEIGHT}px`, flexShrink: 0, backgroundColor: 'black', position: 'relative', transform: `scale(${scale})`, transformOrigin: 'center' }}>
                {currentSlide?.elements.map(el => (
                  <div key={`${el.id}-${el.animation}`} className={`anim-${el.animation || 'none'}`} style={{ position: 'absolute', left: `${el.x}px`, top: `${el.y}px`, width: getPx(el.width), height: getPx(el.height) }}>
                    {renderContent(el, true)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {uiOverlays}
        </div>
      )
    }

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#05080F' }}>
        <style>{globalStyles}</style>
        <div className="portrait-warning">📱 Bitte drehe dein Gerät ins Querformat (Landscape), um den Editor optimal zu nutzen!</div>

        <div className="glass-panel" style={{ margin: '10px 15px', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={() => setActivePresentation(null)} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <ChevronLeft size={16} /> Menü
            </button>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0 }} className="text-gold">
              {activePresentation.name_de} <span style={{ fontSize: '0.8rem', color: '#FFF9E6', WebkitTextFillColor: '#FFF9E6', textShadow: 'none' }}>({activePresentation.name_ar})</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

            <button onClick={handleUndo} disabled={historyStep <= 0} className="btn-glass" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem', opacity: historyStep <= 0 ? 0.3 : 1 }} title="Rückgängig">
              <Undo size={14} />
            </button>
            <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="btn-glass" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem', opacity: historyStep >= history.length - 1 ? 0.3 : 1 }} title="Wiederholen">
              <Redo size={14} />
            </button>

            <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(212, 175, 55, 0.3)', margin: '0 4px' }}></div>

            <button onClick={async () => { setIsFullscreenMode(true); await enterFullscreenAndLandscape(); }} className="btn-glass" title="Vorschau abspielen" style={{ padding: '6px 12px', color: '#E8C56C', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <Play size={14} /> Vorschau
            </button>
            <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(212, 175, 55, 0.3)', margin: '0 2px' }}></div>
            <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={() => fileInputRef.current.click()} disabled={isUploading} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <ImageIcon size={14} /> {isUploading ? 'Medien...' : 'Bild/Video'}
            </button>

            <button onClick={addTextElement} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <Type size={14} /> Text
            </button>

            <button onClick={() => addShape('arrow')} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <ArrowRight size={14} /> Pfeil
            </button>
            <button onClick={() => addShape('line')} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
              <Minus size={14} /> Linie
            </button>

            <button onClick={savePresentation} style={{ padding: '6px 16px', background: 'linear-gradient(90deg, #BF953F, #FCF6BA)', color: '#05080F', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '0.9rem', boxShadow: '0 0 15px rgba(212, 175, 55, 0.4)' }}>
              <Save size={14} /> Speichern
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          <div className="glass-panel" style={{ width: '220px', minWidth: '220px', flexShrink: 0, margin: '0 0 15px 15px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', borderRadius: '12px' }}>
            {slides.map((slide, index) => (
              <div key={slide.id} style={{ position: 'relative' }}>
                <div onClick={() => { setCurrentSlideIndex(index); setActiveElementId(null); }} style={{ width: '100%', aspectRatio: '16/9', backgroundColor: currentSlideIndex === index ? '#1E293B' : '#0B0F19', border: currentSlideIndex === index ? '2px solid #E8C56C' : '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', color: currentSlideIndex === index ? '#E8C56C' : '#FFF9E6', transition: '0.2s', boxShadow: currentSlideIndex === index ? '0 0 15px rgba(212, 175, 55, 0.4)' : 'none', fontSize: '0.9rem', fontWeight: currentSlideIndex === index ? 'bold' : 'normal' }}>
                  Folie {index + 1}
                </div>
                {session && (
                  <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(11, 15, 25, 0.85)', padding: '2px', borderRadius: '4px', backdropFilter: 'blur(2px)' }}>
                    <button type="button" onClick={(e) => moveSlideUp(e, index)} disabled={index === 0} className="btn-glass" style={{ padding: '2px', border: 'none', background: 'transparent' }} title="Nach oben"><ArrowUp size={12} /></button>
                    <button type="button" onClick={(e) => moveSlideDown(e, index)} disabled={index === slides.length - 1} className="btn-glass" style={{ padding: '2px', border: 'none', background: 'transparent' }} title="Nach unten"><ArrowDown size={12} /></button>
                    <button type="button" onClick={(e) => duplicateSlide(e, index)} className="btn-glass" style={{ padding: '2px', border: 'none', background: 'transparent', color: '#E8C56C' }} title="Duplizieren"><Plus size={12} /></button>
                    <button type="button" onClick={(e) => deleteSlide(e, index)} disabled={slides.length <= 1} className="btn-glass" style={{ padding: '2px', border: 'none', background: 'transparent', color: '#ff4444' }} title="Löschen"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={addSlide} className="btn-glass" style={{ width: '100%', aspectRatio: '16/9', border: '2px dashed rgba(212, 175, 55, 0.4)', borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#E8C56C', background: 'transparent' }}>
              <Plus size={20} /> <span style={{ fontSize: '0.8rem', marginTop: '4px' }}>Neue Folie</span>
            </button>
          </div>

          <div ref={containerRef} onMouseDown={() => setActiveElementId(null)} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', backgroundImage: 'radial-gradient(circle at center, rgba(212, 175, 55, 0.15) 1px, transparent 1px)', backgroundSize: '20px 20px', overflow: 'hidden' }}>
            <div style={{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px`, minWidth: `${CANVAS_WIDTH}px`, minHeight: `${CANVAS_HEIGHT}px`, flexShrink: 0, backgroundColor: '#000', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '4px', overflow: 'hidden', transform: `scale(${scale})`, transformOrigin: 'center' }}>
              {currentSlide?.elements.map(el => (
                <Rnd
                  key={el.id}
                  size={{ width: getPx(el.width), height: getPx(el.height) }}
                  position={{ x: el.x, y: el.y }}
                  onDragStop={(e, d) => updateElementProps(el.id, { x: d.x, y: d.y })}
                  onResizeStop={(e, dir, ref, delta, position) => { updateElementProps(el.id, { width: ref.style.width, height: ref.style.height, ...position }) }}
                  bounds="parent"
                  scale={scale}
                  dragHandleClassName="drag-handle"
                  onMouseDown={(e) => { e.stopPropagation(); setActiveElementId(el.id); }}
                  style={{ border: activeElementId === el.id ? '2px solid rgba(212, 175, 55, 0.8)' : '1px dashed rgba(212, 175, 55, 0.2)', zIndex: activeElementId === el.id ? 50 : 1 }}
                >
                  {activeElementId === el.id && (
                    <div className="drag-handle" style={{ cursor: 'move', position: 'absolute', top: '-48px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', backgroundColor: 'rgba(16, 24, 40, 0.95)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.4)', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap', alignItems: 'center' }}>
                      <div style={{ color: '#E8C56C', display: 'flex', alignItems: 'center', padding: '0 6px' }} title="Hier anfassen zum Bewegen"><Move size={18} /></div>
                      <div style={{ width: '1px', height: '20px', background: 'rgba(212, 175, 55, 0.3)', margin: '0 4px' }} />

                      <div onMouseDown={(e) => e.stopPropagation()} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

                        <input type="range" min="0" max="360" value={el.rotation || 0} onChange={(e) => updateElementProps(el.id, { rotation: parseInt(e.target.value) })} title="Drehen" style={{ width: '50px', cursor: 'pointer' }} />
                        <div style={{ width: '1px', height: '20px', background: 'rgba(212, 175, 55, 0.3)', margin: '0 4px' }} />

                        {el.type === 'text' && (
                          <>
                            <button type="button" onClick={() => updateElementProps(el.id, { fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' })} className="btn-glass" style={{ padding: '4px 8px', background: el.fontWeight === 'bold' ? 'rgba(212, 175, 55, 0.5)' : '' }} title="Fett"><Bold size={16} /></button>
                            <button type="button" onClick={() => updateElementProps(el.id, { textAlign: 'left' })} className="btn-glass" style={{ padding: '4px 8px', background: el.textAlign === 'left' ? 'rgba(212, 175, 55, 0.5)' : '' }} title="Linksbündig"><AlignLeft size={16} /></button>
                            <button type="button" onClick={() => updateElementProps(el.id, { textAlign: 'center' })} className="btn-glass" style={{ padding: '4px 8px', background: (!el.textAlign || el.textAlign === 'center') ? 'rgba(212, 175, 55, 0.5)' : '' }} title="Zentriert"><AlignCenter size={16} /></button>
                            <button type="button" onClick={() => updateElementProps(el.id, { textAlign: 'right' })} className="btn-glass" style={{ padding: '4px 8px', background: el.textAlign === 'right' ? 'rgba(212, 175, 55, 0.5)' : '' }} title="Rechtsbündig"><AlignRight size={16} /></button>

                            <button type="button" onClick={() => updateElementProps(el.id, { fontSize: el.fontSize + 4 })} className="btn-glass" style={{ padding: '4px 8px', fontSize: '0.9rem' }}>+</button>
                            <button type="button" onClick={() => updateElementProps(el.id, { fontSize: el.fontSize - 4 })} className="btn-glass" style={{ padding: '4px 8px', fontSize: '0.9rem' }}>-</button>

                            <input type="color" value={el.color} onChange={(e) => updateElementProps(el.id, { color: e.target.value })} title="Textfarbe" style={{ width: '24px', height: '24px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent', alignSelf: 'center' }} />
                            <input type="color" value={el.backgroundColor === 'transparent' ? '#000000' : el.backgroundColor} onChange={(e) => updateElementProps(el.id, { backgroundColor: e.target.value })} title="Hintergrundfarbe (Markieren)" style={{ width: '24px', height: '24px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent', alignSelf: 'center' }} />

                            <select value={el.fontFamily || 'Georgia, serif'} onChange={(e) => updateElementProps(el.id, { fontFamily: e.target.value })} style={{ padding: '4px 6px', backgroundColor: 'rgba(11, 15, 25, 0.9)', color: '#FFF9E6', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '4px', outline: 'none', fontSize: '0.9rem', maxWidth: '80px' }}>
                              <option value="Arial, sans-serif">Arial</option>
                              <option value="Times New Roman, serif">Times</option>
                              <option value="Courier New, monospace">Courier</option>
                              <option value="Georgia, serif">Georgia</option>
                            </select>
                            <div style={{ width: '1px', height: '20px', background: 'rgba(212, 175, 55, 0.3)', margin: '0 4px' }} />
                          </>
                        )}

                        {el.type === 'shape' && (
                          <input type="color" value={el.color} onChange={(e) => updateElementProps(el.id, { color: e.target.value })} title="Form-Farbe" style={{ width: '24px', height: '24px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent', alignSelf: 'center', marginRight: '5px' }} />
                        )}

                        <select value={el.animation || 'none'} onChange={(e) => updateElementProps(el.id, { animation: e.target.value })} style={{ padding: '4px 6px', backgroundColor: 'rgba(11, 15, 25, 0.9)', color: '#FFF9E6', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '4px', outline: 'none', fontSize: '0.9rem', maxWidth: '80px' }}>
                          <option value="none">Anim</option>
                          <option value="fadeIn">Fade</option>
                          <option value="slideUp">Hoch</option>
                          <option value="zoomIn">Zoom</option>
                        </select>

                        <button type="button" onClick={() => deleteElement(el.id)} className="btn-glass" style={{ padding: '4px 8px', color: '#ff4444' }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}

                  <div className={`anim-${el.animation || 'none'}`} style={{ width: '100%', height: '100%' }}>
                    {renderContent(el, false)}
                  </div>

                </Rnd>
              ))}
            </div>
          </div>
        </div>
        {signature}
        {uiOverlays}
      </div>
    )
  }

  // --- ANSICHT 2: HOMEPAGE ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{globalStyles}</style>

      <div className="glass-panel" style={{ margin: '15px 20px', padding: '12px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3px', backgroundColor: '#fff', borderRadius: '50%', border: '1px solid rgba(212, 175, 55, 0.8)', boxShadow: '0 0 10px rgba(212, 175, 55, 0.4)' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '50%' }} />
          </div>

          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', letterSpacing: '2px' }} className="text-gold">
            ⲗⲱⲃϣ
          </h1>

        </div>

        <div>
          {session ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span style={{ color: '#E8C56C', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', '@media (max-width: 600px)': { display: 'none' } }}><div style={{ width: '8px', height: '8px', backgroundColor: '#E8C56C', borderRadius: '50%', boxShadow: '0 0 5px #E8C56C' }}></div> Admin</span>
              <button onClick={() => supabase.auth.signOut()} className="btn-glass" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255, 68, 68, 0.4)', fontSize: '0.9rem', color: '#ff4444' }}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(!showLogin)} className="btn-glass" style={{ padding: '6px 15px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
              <Settings size={14} /> Admin
            </button>
          )}
        </div>
      </div>

      {showLogin && !session && (
        <div className="anim-zoomIn glass-panel" style={{ position: 'absolute', top: '75px', right: '20px', width: '280px', padding: '20px', zIndex: 100 }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1.2rem' }} className="text-gold">Admin Login</h3>
          <form onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) showToast(error.message, 'error'); else setShowLogin(false) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '10px', background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', color: 'white', outline: 'none', fontSize: '0.9rem' }} />
            <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '10px', background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', color: 'white', outline: 'none', fontSize: '0.9rem' }} />
            <button type="submit" style={{ padding: '10px', background: 'linear-gradient(90deg, #BF953F, #FCF6BA)', color: '#05080F', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Einloggen</button>
          </form>
        </div>
      )}

      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ width: '100%', maxWidth: '900px', marginBottom: '30px', animation: 'fadeIn 1s' }}>
          {currentFolder ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => setCurrentFolder(null)} className="btn-glass" style={{ padding: '8px', borderRadius: '50%' }}><ChevronLeft size={20} color="#E8C56C" /></button>
              <div>
                <h2 style={{ margin: 0, fontSize: '2rem' }} className="text-gold">{currentFolder.name_de}</h2>
                <span style={{ color: '#FFF9E6', fontSize: '1.2rem' }}>{currentFolder.name_ar}</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '2.8rem', margin: '0 0 8px 0', fontWeight: 'bold' }} className="text-gold">Übersicht</h2>
            </div>
          )}
        </div>

        <div className="anim-slideUp" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px', width: '100%', maxWidth: '900px' }}>

          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`folder-card ${folder.type === 'content' ? 'content-card' : ''}`}
              onClick={async () => {
                if (folder.type === 'folder') setCurrentFolder(folder);
                else await openPresentation(folder);
              }}
              draggable={!!session}
              onDragStart={(e) => handleDragStart(e, folder)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, folder)}
              style={{ padding: '25px 15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minHeight: '150px', cursor: session ? 'grab' : 'pointer', opacity: draggedFolder?.id === folder.id ? 0.5 : 1 }}
            >
              {session && (
                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                  <button type="button" onClick={(e) => openEditMenu(e, folder)} className="btn-glass" style={{ padding: '5px', backgroundColor: 'rgba(212, 175, 55, 0.15)', border: 'none' }} title="Bearbeiten"><Edit2 size={12} color="#E8C56C" /></button>
                  <button type="button" onClick={(e) => deleteButton(e, folder.id)} className="btn-glass" style={{ padding: '5px', backgroundColor: 'rgba(255, 68, 68, 0.15)', color: '#ff4444', border: 'none' }} title="Löschen"><Trash2 size={12} /></button>
                </div>
              )}

              <div style={{ marginBottom: '15px', width: '55px', height: '55px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {folder.icon_url ? (
                  <img src={folder.icon_url} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.6))' }} draggable="false" />
                ) : (
                  <div style={{ color: '#E8C56C', filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.6))' }}>
                    {folder.type === 'folder' ? <Folder size={45} strokeWidth={1.5} /> : <FileText size={45} strokeWidth={1.5} />}
                  </div>
                )}
              </div>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '1.3rem', color: '#FFF9E6', fontWeight: 'bold' }}>{folder.name_de}</h3>
              <span style={{ fontSize: '1rem', color: '#E8C56C' }}>{folder.name_ar}</span>
            </div>
          ))}

          {session && (
            <div onClick={() => setShowAddMenu(true)} className="folder-card" style={{ padding: '25px 15px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(212, 175, 55, 0.5)', background: 'transparent', minHeight: '150px', opacity: 0.8, cursor: 'pointer' }}>
              <Plus size={36} color="#E8C56C" style={{ marginBottom: '10px' }} />
              <span style={{ color: '#E8C56C', fontWeight: 'bold', fontSize: '1rem' }}>Neu hinzufügen</span>
            </div>
          )}
        </div>
      </div>

      {showAddMenu && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="anim-zoomIn glass-panel" style={{ padding: '30px', width: '320px', maxHeight: '90vh', overflowY: 'auto', background: '#0B0F19', border: '1px solid rgba(212, 175, 55, 0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.3rem' }} className="text-gold">
              {editingFolder ? 'Element bearbeiten' : 'Neues Element'}
            </h3>
            <form onSubmit={handleSaveButton} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: '#FFF9E6', fontSize: '0.85rem' }}>Titel (Deutsch)</label>
                <input type="text" value={nameDe} onChange={(e) => setNameDe(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', color: '#FFF9E6', outline: 'none', fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: '#FFF9E6', fontSize: '0.85rem' }}>Titel (Arabisch)</label>
                <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required style={{ width: '100%', padding: '10px', background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', color: '#FFF9E6', outline: 'none', fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: '#FFF9E6', fontSize: '0.85rem' }}>Art des Elements</label>
                <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%', padding: '10px', background: 'rgba(11, 15, 25, 0.8)', border: '1px solid rgba(212, 175, 55, 0.4)', borderRadius: '6px', color: '#FFF9E6', outline: 'none', appearance: 'none', fontSize: '0.9rem' }}>
                  <option value="folder">Ordner (Weiteres Menü)</option>
                  <option value="content">Inhalt (Präsentation)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: '#FFF9E6', fontSize: '0.85rem' }}>Eigenes Icon (Optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '40px', height: '40px', backgroundColor: '#fff', border: '1px solid rgba(212, 175, 55, 0.8)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: '3px' }}>
                    {customIconUrl ? <img src={customIconUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} /> : <ImageIcon size={20} color="#0B0F19" />}
                  </div>
                  <input type="file" accept="image/*" ref={iconInputRef} onChange={handleIconUpload} style={{ display: 'none' }} />
                  <button type="button" onClick={() => iconInputRef.current.click()} disabled={isUploadingIcon} className="btn-glass" style={{ padding: '8px 12px', fontSize: '0.85rem', color: '#FFF9E6' }}>
                    {isUploadingIcon ? 'Lädt...' : 'Bild wählen'}
                  </button>
                  {customIconUrl && <button type="button" onClick={() => setCustomIconUrl('')} className="btn-glass" style={{ padding: '8px', color: '#ff4444' }}><Trash2 size={14} /></button>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={closeAddMenu} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(212, 175, 55, 0.5)', color: '#FFF9E6', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>Abbrechen</button>
                <button type="submit" style={{ flex: 1, padding: '10px', background: 'linear-gradient(90deg, #BF953F, #FCF6BA)', border: 'none', color: '#05080F', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {(!activePresentation) && signature}
      {uiOverlays}
    </div>
  )
}

export default App