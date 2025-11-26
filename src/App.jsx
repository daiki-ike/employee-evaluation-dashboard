import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import EvaluationSheet from './components/EvaluationSheet'
import DataUpload from './components/DataUpload'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [salesRanking, setSalesRanking] = useState(null)
  const [evaluationMaster, setEvaluationMaster] = useState(null)
  const [evaluationData, setEvaluationData] = useState(null)

  useEffect(() => {
    // ローカルストレージから認証情報を復元
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }

    // データを復元
    const savedSalesData = localStorage.getItem('salesData')
    const savedSalesRanking = localStorage.getItem('salesRanking')
    const savedEvaluationMaster = localStorage.getItem('evaluationMaster')
    const savedEvaluationData = localStorage.getItem('evaluationData')

    if (savedSalesData) setSalesData(JSON.parse(savedSalesData))
    if (savedSalesRanking) setSalesRanking(JSON.parse(savedSalesRanking))
    if (savedEvaluationMaster) setEvaluationMaster(JSON.parse(savedEvaluationMaster))
    if (savedEvaluationData) setEvaluationData(JSON.parse(savedEvaluationData))
  }, [])

  const handleLogin = (userInfo) => {
    setUser(userInfo)
    localStorage.setItem('user', JSON.stringify(userInfo))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('user')
  }

  const handleDataUpload = (type, data) => {
    if (type === 'sales') {
      setSalesData(data)
      localStorage.setItem('salesData', JSON.stringify(data))
    } else if (type === 'salesRanking') {
      setSalesRanking(data)
      localStorage.setItem('salesRanking', JSON.stringify(data))
    } else if (type === 'evaluationMaster') {
      setEvaluationMaster(data)
      localStorage.setItem('evaluationMaster', JSON.stringify(data))
    } else if (type === 'evaluationData') {
      setEvaluationData(data)
      localStorage.setItem('evaluationData', JSON.stringify(data))
    }
  }

  return (
   <Router basename="/employee-evaluation-dashboard">
      <div className="App">
        {user && (
          <header className="app-header">
            <h1>社員評価ダッシュボード</h1>
            <div className="user-info">
              <span>{user.role === 'manager' ? `部長 (${user.department})` : user.role === 'president' ? '社長' : '管理者'}</span>
              <button onClick={handleLogout} className="logout-btn">ログアウト</button>
            </div>
          </header>
        )}

        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />}
          />
          <Route
            path="/dashboard"
            element={user ? <Dashboard user={user} salesRanking={salesRanking} /> : <Navigate to="/login" />}
          />
          <Route
            path="/evaluation"
            element={user ? <EvaluationSheet user={user} evaluationMaster={evaluationMaster} evaluationData={evaluationData} /> : <Navigate to="/login" />}
          />
          <Route
            path="/upload"
            element={user && (user.role === 'admin' || user.role === 'president') ? <DataUpload onUpload={handleDataUpload} /> : <Navigate to="/login" />}
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
