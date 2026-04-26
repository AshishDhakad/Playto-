import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import MerchantDashboard from './pages/MerchantDashboard'
import ReviewerDashboard from './pages/ReviewerDashboard'
import ReviewDetail from './pages/ReviewDetail'

function PrivateRoute({ children, role }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  if (!user) return <Navigate to="/login" />
  if (role && user.role !== role) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/merchant" element={
          <PrivateRoute role="merchant"><MerchantDashboard /></PrivateRoute>
        } />
        <Route path="/reviewer" element={
          <PrivateRoute role="reviewer"><ReviewerDashboard /></PrivateRoute>
        } />
        <Route path="/reviewer/submission/:id" element={
          <PrivateRoute role="reviewer"><ReviewDetail /></PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}
