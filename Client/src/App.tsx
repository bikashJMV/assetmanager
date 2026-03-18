import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/common/Navbar'
import Home from './components/pages/Home'
import Feature from './components/pages/Feature'
import AssetDetail from './components/pages/AssetDetail'
import ScanPage from './components/pages/ScanPage'
import PageNotFound from './components/common/PageNotFound'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/assets" element={<Feature />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/scan/:id" element={<ScanPage />} />
        <Route path="/404" element={<PageNotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
