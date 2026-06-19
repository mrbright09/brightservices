import { Routes, Route } from 'react-router-dom'
import LoadList from './LoadList'

export default function FreightRoutes() {
  return (
    <Routes>
      <Route index    element={<LoadList />} />
      {/* Phase 2: add LoadDetail, CreateLoad routes here */}
    </Routes>
  )
}
