import { Routes, Route, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LevelPage from './pages/LevelPage'
import ReaderPage from './pages/ReaderPage'
import StatsPage from './pages/StatsPage'
import { ProgressProvider } from './contexts/ProgressContext'

function App() {
  const location = useLocation()
  const isReaderPage = location.pathname.startsWith('/read/')

  return (
    <ProgressProvider>
      <div className={isReaderPage ? '' : 'app-container'}>
        {!isReaderPage && (
          <header className="header">
            <Link to="/" className="header-logo">
              📚 RAZ Reading
            </Link>
            <nav className="header-nav">
              <Link to="/stats" className="nav-link">📊 统计</Link>
              <Link to="/" className="nav-link">首页</Link>
            </nav>
          </header>
        )}
        <main className={isReaderPage ? '' : 'main-content'}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/level/:level" element={<LevelPage />} />
            <Route path="/read/:level/:bookId" element={<ReaderPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </main>
      </div>
    </ProgressProvider>
  )
}

export default App
