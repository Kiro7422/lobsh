import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import { Rnd } from 'react-rnd'
import imageCompression from 'browser-image-compression'

function App() {
  // --- NEU: Loading State ---
  const [isLoading, setIsLoading] = useState(true)

  const [session, setSession] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [folders, setFolders] = useState([])
  const [currentFolder, setCurrentFolder] = useState(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [nameDe, setNameDe] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('folder')

  const [activePresentation, setActivePresentation] = useState(null)
  const [slides, setSlides] = useState([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef(null)

  // Simulation des Loading Screens beim Start
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2500) // Zeigt den Loading-Screen für 2,5 Sekunden
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

  const fetchFolders = async () => {
    let query = supabase.from('folders').select('*')
    if (currentFolder === null) query = query.is('parent_id', null)
    else query = query.eq('parent_id', currentFolder.id)

    const { data } = await query.order('created_at', { ascending: true })
    if (data) setFolders(data)
  }

  const handleAddButton = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('folders').insert([{ name_de: nameDe, name_ar: nameAr, type: type, parent_id: currentFolder ? currentFolder.id : null }])
    if (!error) { setShowAddMenu(false); setNameDe(''); setNameAr(''); fetchFolders() }
  }

  const openPresentation = (folder) => {
    setActivePresentation(folder)
    setSlides(folder.slides || [{ id: Date.now(), elements: [] }])
    setCurrentSlideIndex(0)
  }

  const savePresentation = async () => {
    const { error } = await supabase.from('folders').update({ slides: slides }).eq('id', activePresentation.id)
    if (error) alert("Fehler beim Speichern!")
    else alert("Präsentation erfolgreich gespeichert!")
  }

  const addSlide = () => {
    setSlides([...slides, { id: Date.now(), elements: [] }])
    setCurrentSlideIndex(slides.length)
  }

  const updateSlideElements = (newElements) => {
    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex].elements = newElements
    setSlides(updatedSlides)
  }

  const updateElementProps = (elementId, newProps) => {
    const currentElements = slides[currentSlideIndex].elements
    const newElements = currentElements.map(el => el.id === elementId ? { ...el, ...newProps } : el)
    updateSlideElements(newElements)
  }

  const deleteElement = async (elementId) => {
    const newElements = slides[currentSlideIndex].elements.filter(el => el.id !== elementId)
    updateSlideElements(newElements)
  }

  const addTextElement = () => {
    // Neu: animation Property hinzugefügt
    const newElement = { id: Date.now(), type: 'text', content: 'Neuer Text', x: 50, y: 50, width: 300, height: 100, fontSize: 24, color: '#ffffff', animation: 'none' }
    updateSlideElements([...slides[currentSlideIndex].elements, newElement])
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setIsUploading(true)
    let fileToUpload = file

    if (file.type.startsWith('image/')) {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true }
      try { fileToUpload = await imageCompression(file, options) } catch (error) { console.error(error) }
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage.from('media').upload(fileName, fileToUpload)
    if (uploadError) {
      alert("Fehler beim Hochladen: " + uploadError.message); setIsUploading(false); return
    }

    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName)

    const isVideo = file.type.startsWith('video/')
    const newElement = {
      id: Date.now(),
      type: isVideo ? 'video' : 'image',
      src: publicUrl,
      x: 100, y: 100, width: 400, height: 300,
      animation: 'none' // Neu: animation Property
    }

    updateSlideElements([...slides[currentSlideIndex].elements, newElement])
    setIsUploading(false)
    event.target.value = null
  }

  // --- NEU: Globale CSS Styles für die Animationen ---
  const globalStyles = `
    @keyframes appPulse {
      0% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.05); opacity: 1; text-shadow: 0 0 20px rgba(255,255,255,0.4); }
      100% { transform: scale(1); opacity: 0.8; }
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideInUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes zoomIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    
    .anim-fadeIn { animation: fadeIn 1s ease-out forwards; }
    .anim-slideInUp { animation: slideInUp 0.8s ease-out forwards; }
    .anim-zoomIn { animation: zoomIn 0.8s ease-out forwards; }
    .anim-none { }
  `

  // ANSICHT 0: LOADING SCREEN
  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', color: 'white' }}>
        <style>{globalStyles}</style>
        {/* Platzhalter für dein späteres Logo */}
        <div style={{ width: '120px', height: '120px', borderRadius: '50%', border: '2px dashed #444', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '30px' }}>
          <span style={{ color: '#666' }}>Dein Logo</span>
        </div>
        {/* Pulsierender App-Name */}
        <h1 style={{ fontSize: '5rem', margin: '0', letterSpacing: '4px', animation: 'appPulse 2s infinite ease-in-out' }}>
          ⲗⲱⲃϣ
        </h1>
      </div>
    )
  }

  // ANSICHT 1: DER POWERPOINT EDITOR
  if (activePresentation) {
    const currentSlide = slides[currentSlideIndex]

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111', color: 'white' }}>
        <style>{globalStyles}</style>

        {/* Editor Kopfzeile */}
        <div style={{ padding: '15px 30px', backgroundColor: '#222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button onClick={() => setActivePresentation(null)} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px', marginRight: '20px' }}>⬅ Zurück</button>
            <span style={{ fontSize: '1.2rem' }}>{activePresentation.name_de} / {activePresentation.name_ar}</span>
          </div>

          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current.click()} disabled={isUploading} style={{ padding: '8px 16px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {isUploading ? 'Lädt hoch...' : '+ Bild / Video'}
              </button>
              <button onClick={addTextElement} style={{ padding: '8px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Text</button>
              <button onClick={savePresentation} style={{ padding: '8px 16px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>💾 Speichern</button>
            </div>
          )}
        </div>

        {/* Die Arbeitsfläche */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          <div style={{ width: '1000px', height: '600px', backgroundColor: '#000', position: 'relative', boxShadow: '0 0 20px rgba(0,0,0,0.5)', border: '1px solid #333' }}>

            {currentSlide?.elements.map(el => (
              <Rnd
                key={el.id}
                size={{ width: el.width, height: el.height }}
                position={{ x: el.x, y: el.y }}
                onDragStop={(e, d) => updateElementProps(el.id, { x: d.x, y: d.y })}
                onResizeStop={(e, dir, ref, delta, position) => { updateElementProps(el.id, { width: ref.style.width, height: ref.style.height, ...position }) }}
                disableDragging={!session}
                enableResizing={session ? { top: true, right: true, bottom: true, left: true, topRight: true, bottomRight: true, bottomLeft: true, topLeft: true } : false}
                bounds="parent"
                style={{ border: session ? '1px dashed #555' : 'none' }}
              >
                {/* Werkzeugleiste inkl. Animations-Dropdown */}
                {session && (
                  <div style={{ position: 'absolute', top: '-35px', right: '0', display: 'flex', gap: '5px', backgroundColor: '#333', padding: '4px', borderRadius: '6px', zIndex: 100 }}>
                    <select value={el.animation || 'none'} onChange={(e) => updateElementProps(el.id, { animation: e.target.value })} style={{ padding: '2px', cursor: 'pointer', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '4px' }}>
                      <option value="none">Keine Animation</option>
                      <option value="fadeIn">Einblenden</option>
                      <option value="slideInUp">Von unten einfliegen</option>
                      <option value="zoomIn">Reinzoomen</option>
                    </select>

                    {el.type === 'text' && (
                      <>
                        <button onClick={() => updateElementProps(el.id, { fontSize: el.fontSize + 2 })} style={{ cursor: 'pointer' }}>+</button>
                        <button onClick={() => updateElementProps(el.id, { fontSize: el.fontSize - 2 })} style={{ cursor: 'pointer' }}>-</button>
                        <input type="color" value={el.color} onChange={(e) => updateElementProps(el.id, { color: e.target.value })} style={{ width: '25px', padding: '0', cursor: 'pointer' }} />
                      </>
                    )}
                    <button onClick={() => deleteElement(el.id)} style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>X</button>
                  </div>
                )}

                {/* Elemente mit der zugewiesenen Animations-Klasse rendern */}
                {el.type === 'text' && (
                  <textarea className={`anim-${el.animation || 'none'}`} value={el.content} onChange={(e) => updateElementProps(el.id, { content: e.target.value })} readOnly={!session} style={{ width: '100%', height: '100%', fontSize: `${el.fontSize}px`, color: el.color, backgroundColor: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', textAlign: 'center' }} />
                )}

                {el.type === 'image' && (
                  <img className={`anim-${el.animation || 'none'}`} src={el.src} alt="Upload" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable="false" />
                )}

                {el.type === 'video' && (
                  <video className={`anim-${el.animation || 'none'}`} src={el.src} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                )}

              </Rnd>
            ))}

          </div>
        </div>

        {/* Slide-Übersicht */}
        <div style={{ height: '120px', backgroundColor: '#222', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '15px', overflowX: 'auto' }}>
          {slides.map((slide, index) => (
            <div key={slide.id} onClick={() => setCurrentSlideIndex(index)} style={{ minWidth: '150px', height: '90px', backgroundColor: currentSlideIndex === index ? '#4CAF50' : '#444', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', border: currentSlideIndex === index ? '2px solid white' : 'none' }}>
              Folie {index + 1}
            </div>
          ))}
          {session && (
            <button onClick={addSlide} style={{ minWidth: '90px', height: '90px', backgroundColor: '#333', border: '2px dashed #666', borderRadius: '8px', cursor: 'pointer', fontSize: '2rem', color: '#888' }}>+</button>
          )}
        </div>
      </div>
    )
  }

  // ANSICHT 2: ORDNER STRUKTUR (Hauptmenü)
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#121212', color: 'white', fontFamily: 'sans-serif', padding: '20px' }}>
      <style>{globalStyles}</style>
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        {session ? (
          <button onClick={() => supabase.auth.signOut()} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px' }}>Admin Logout</button>
        ) : (
          <button onClick={() => setShowLogin(!showLogin)} style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '4px' }}>Admin Login</button>
        )}
      </div>

      {showLogin && !session && (
        <div style={{ position: 'absolute', top: '60px', left: '20px', backgroundColor: '#222', padding: '15px', borderRadius: '8px', zIndex: 10 }}>
          <form onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) alert(error.message); else setShowLogin(false) }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '8px' }} />
            <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '8px' }} />
            <button type="submit" style={{ padding: '8px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>Einloggen</button>
          </form>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '60px', marginBottom: '40px', animation: 'fadeIn 1s ease-out' }}>
        <h1 style={{ fontSize: '3rem', margin: '0', letterSpacing: '2px' }}>ⲗⲱⲃϣ</h1>
        {currentFolder && (
          <div style={{ marginTop: '20px' }}>
            <button onClick={() => setCurrentFolder(null)} style={{ padding: '8px 16px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>⬅ Zurück zur Startseite</button>
            <h2 style={{ marginTop: '10px', color: '#aaa' }}>{currentFolder.name_de} / {currentFolder.name_ar}</h2>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', maxWidth: '800px', margin: '0 auto', animation: 'slideInUp 0.8s ease-out' }}>
        {folders.map((folder) => (
          <button key={folder.id} onClick={() => { folder.type === 'folder' ? setCurrentFolder(folder) : openPresentation(folder) }} style={{ width: '200px', height: '100px', backgroundColor: folder.type === 'folder' ? '#2c3e50' : '#8e44ad', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }}>
            <span>{folder.name_de}</span>
            <span style={{ fontSize: '1rem', color: '#ccc' }}>{folder.name_ar}</span>
          </button>
        ))}
        {session && (
          <button onClick={() => setShowAddMenu(true)} style={{ width: '200px', height: '100px', backgroundColor: '#333', border: '2px dashed #666', borderRadius: '12px', fontSize: '3rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        )}
      </div>

      {showAddMenu && (
        <div style={{ position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div style={{ backgroundColor: '#222', padding: '30px', borderRadius: '12px', width: '300px', animation: 'zoomIn 0.3s ease-out' }}>
            <h3 style={{ marginTop: '0' }}>Neuen Button hinzufügen</h3>
            <form onSubmit={handleAddButton} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input type="text" placeholder="Name (Deutsch)" value={nameDe} onChange={(e) => setNameDe(e.target.value)} required style={{ padding: '10px' }} />
              <input type="text" placeholder="Name (Arabisch)" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required style={{ padding: '10px' }} />
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '10px' }}>
                <option value="folder">Weiteres Menü (Ordner)</option>
                <option value="content">Inhaltsseite (PowerPoint)</option>
              </select>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ flex: 1, padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>Speichern</button>
                <button type="button" onClick={() => setShowAddMenu(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#d9534f', color: 'white', border: 'none', cursor: 'pointer' }}>Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App