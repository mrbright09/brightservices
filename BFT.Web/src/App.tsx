import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { msalConfig, loginRequest } from './auth/msalConfig'
import FreightRoutes from './routes/freight/FreightRoutes'

const msalInstance = new PublicClientApplication(msalConfig)

export default function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthenticatedTemplate>
        <BrowserRouter>
          <Routes>
            <Route path="/freight/*"  element={<FreightRoutes />} />
            <Route path="/tow/*"     element={<Placeholder label="Tow — Phase 4" />} />
            <Route path="/health/*"  element={<Placeholder label="Health — Phase 4" />} />
            <Route path="/drivers/*" element={<Placeholder label="Drivers — Phase 2" />} />
            <Route path="/reports/*" element={<Placeholder label="Reports — Phase 3" />} />
            <Route path="*"          element={<Navigate to="/freight" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <LoginScreen />
      </UnauthenticatedTemplate>
    </MsalProvider>
  )
}

function LoginScreen() {
  const { instance } = useMsal()
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Inter,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <h1 style={{ fontSize:'1.5rem', marginBottom:'1.5rem' }}>BFT Services</h1>
        <button
          onClick={() => instance.loginRedirect(loginRequest)}
          style={{ padding:'0.75rem 1.5rem', background:'#0066ff', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'1rem', fontWeight:700 }}
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return <div style={{ padding:'2rem', fontFamily:'Inter,sans-serif', color:'#6b7280' }}>{label}</div>
}
