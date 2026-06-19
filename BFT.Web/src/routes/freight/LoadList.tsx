import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { apiRequest } from '../../api/client'

interface Load {
  id: string
  origin: string
  destination: string
  weightLbs: number
  status: string
  driver: { name: string } | null
}

export default function LoadList() {
  const { instance, accounts } = useMsal()
  const [loads, setLoads]     = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const account = accounts[0]
    if (!account) return
    apiRequest<Load[]>(instance, account, 'GET', '/api/freight/loads')
      .then(setLoads)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [instance, accounts])

  if (loading) return <p style={{ padding:'2rem' }}>Loading loads…</p>
  if (error)   return <p style={{ padding:'2rem', color:'red' }}>{error}</p>

  return (
    <div style={{ padding:'2rem', fontFamily:'Inter,sans-serif' }}>
      <h1 style={{ fontSize:'1.5rem', marginBottom:'1.5rem' }}>Freight Loads</h1>
      {loads.length === 0 ? (
        <p style={{ color:'#6b7280' }}>No loads yet. Create one to get started.</p>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ textAlign:'left', borderBottom:'2px solid #e5e7eb' }}>
              <th style={{ padding:'0.5rem 1rem' }}>Origin</th>
              <th style={{ padding:'0.5rem 1rem' }}>Destination</th>
              <th style={{ padding:'0.5rem 1rem' }}>Weight (lbs)</th>
              <th style={{ padding:'0.5rem 1rem' }}>Driver</th>
              <th style={{ padding:'0.5rem 1rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loads.map(l => (
              <tr key={l.id} style={{ borderBottom:'1px solid #e5e7eb' }}>
                <td style={{ padding:'0.5rem 1rem' }}>{l.origin}</td>
                <td style={{ padding:'0.5rem 1rem' }}>{l.destination}</td>
                <td style={{ padding:'0.5rem 1rem' }}>{l.weightLbs.toLocaleString()}</td>
                <td style={{ padding:'0.5rem 1rem' }}>{l.driver?.name ?? '—'}</td>
                <td style={{ padding:'0.5rem 1rem' }}>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
