import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import EvaluationSheet from './components/EvaluationSheet'
import DataUpload from './components/DataUpload'
import { SHEET_CONFIG } from './config/sheetConfig'
import { fetchAllSalesSheets } from './utils/salesApi'
import { fetchSheetData, convertToStructuredData, mergeEvaluationData } from './utils/sheetsApi'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [salesRanking, setSalesRanking] = useState(null)
  const [evaluationMaster, setEvaluationMaster] = useState(null)
  const [evaluationData, setEvaluationData] = useState(null)

  // データ読み込み状態
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [loadingError, setLoadingError] = useState(null)

  useEffect(() => {
    // ローカルストレージから認証情報を復元
    const savedUser = localStorage.getItem('user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }

    // データを復元（ローカルストレージ）
    const savedSalesData = localStorage.getItem('salesData')
    const savedSalesRanking = localStorage.getItem('salesRanking')
    const savedEvaluationMaster = localStorage.getItem('evaluationMaster')
    const savedEvaluationData = localStorage.getItem('evaluationData')

    if (savedSalesData) setSalesData(JSON.parse(savedSalesData))
    if (savedSalesRanking) setSalesRanking(JSON.parse(savedSalesRanking))
    if (savedEvaluationMaster) setEvaluationMaster(JSON.parse(savedEvaluationMaster))
    if (savedEvaluationData) setEvaluationData(JSON.parse(savedEvaluationData))

    // 自動データ読み込み（Auto-Fetch）
    // マウント時（リロード時）に必ず最新データを取得しにいく
    fetchLatestData()
  }, [])

  const fetchLatestData = async () => {
    setIsDataLoading(true)
    setLoadingError(null)
    console.log('[App] Starting Auto-Fetch...')

    try {
      // 1. 売上ランキングデータの取得
      const salesPromise = fetchAllSalesSheets(SHEET_CONFIG.SALES.URL, SHEET_CONFIG.SALES.SHEET_NAMES)

      // 2. 評価データの取得（4シート並列）
      const evalConfig = SHEET_CONFIG.EVALUATION
      const evalPromise = Promise.allSettled([
        fetchSheetData(evalConfig.URL, evalConfig.SHEETS.MASTER.NAME),
        fetchSheetData(evalConfig.URL, evalConfig.SHEETS.SELF_EVAL.NAME),
        fetchSheetData(evalConfig.URL, evalConfig.SHEETS.MANAGER_EVAL.NAME),
        fetchSheetData(evalConfig.URL, evalConfig.SHEETS.TOTAL_SCORE.NAME)
      ])

      const [salesResult, evalResults] = await Promise.all([salesPromise, evalPromise])

      // 売上データの更新
      if (salesResult) {
        console.log('[App] Auto-Fetch Sales Success')
        handleDataUpload('salesRanking', salesResult)
      }

      // 評価データの集計と更新
      const [masterRaw, selfRaw, managerRaw, scoreRaw] = evalResults

      let masterData = null
      let mergedData = null

      if (masterRaw.status === 'fulfilled') {
        masterData = convertToStructuredData(masterRaw.value, 'evaluationMaster')
        handleDataUpload('evaluationMaster', masterData)
      } else {
        console.error('[App] Auto-Fetch Master Failed:', masterRaw.reason)
      }

      // 評価データの統合（一部失敗してもあるだけでマージする）
      const selfData = selfRaw.status === 'fulfilled' ? convertToStructuredData(selfRaw.value, 'selfEvaluation') : {}
      const managerData = managerRaw.status === 'fulfilled' ? convertToStructuredData(managerRaw.value, 'managerEvaluation') : {}
      const scoreData = scoreRaw.status === 'fulfilled' ? convertToStructuredData(scoreRaw.value, 'totalScore') : {}

      mergedData = mergeEvaluationData(masterData || [], selfData, managerData, scoreData)
      handleDataUpload('evaluationData', mergedData)

      console.log('[App] Auto-Fetch Complete')

    } catch (error) {
      console.error('[App] Auto-Fetch Error:', error)
      setLoadingError('最新データの読み込みに失敗しました。以前のデータを表示します。')
    } finally {
      setIsDataLoading(false)
    }
  }

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
            <div className="header-status">
              {isDataLoading && <span className="loading-status">🔄 データ更新中...</span>}
              {!isDataLoading && loadingError && <span className="error-status" title={loadingError}>⚠️ 通信エラー</span>}
            </div>
            <div className="user-info">
              <span>{user.role === 'manager' ? `部長 (${user.departments?.join(', ') || ''})` : user.role === 'president' ? '社長' : '管理者'}</span>
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
            element={user && (user.role === 'admin' || user.role === 'president') ? (
              <DataUpload
                onUpload={handleDataUpload}
                isAutoFetching={isDataLoading}
                onManualReload={fetchLatestData}
              />
            ) : <Navigate to="/login" />}
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
