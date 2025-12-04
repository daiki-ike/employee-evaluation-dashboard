import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSheetData, convertToStructuredData, mergeEvaluationData, fetchAllSalesSheets } from '../utils/sheetsApi'
import './DataUpload.css'

const DataUpload = ({ onUpload }) => {
  const navigate = useNavigate()

  // 売上データ
  const [salesUrl, setSalesUrl] = useState('https://docs.google.com/spreadsheets/d/1ySCbLFCgnnLgEQUszfBc5BubkXwH3P4kDbLJnibgn1M/edit?usp=sharing')

  // 評価マスター
  const [masterUrl, setMasterUrl] = useState('https://docs.google.com/spreadsheets/d/1xi024jxqTOmta-iABi3IuCPv718Y0EBBfESSke9K94c/edit?usp=sharing')
  const [masterSheetName, setMasterSheetName] = useState('シート1')

  // 自己評価フォーム
  const [selfEvalUrl, setSelfEvalUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXeFR1ixZtb1jVRDc8/')
  const [selfEvalSheetName, setSelfEvalSheetName] = useState('フォームの回答1')

  // 部長評価フォーム
  const [managerEvalUrl, setManagerEvalUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXeFR1ixZtb1jVRDc8/')
  const [managerEvalSheetName, setManagerEvalSheetName] = useState('フォームの回答_部長')

  // 合計評点
  const [totalScoreUrl, setTotalScoreUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXeFR1ixZtb1jVRDc8/')
  const [totalScoreSheetName, setTotalScoreSheetName] = useState('計算_部長')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // localStorage からデータ件数を取得する関数
  const getSalesCount = () => {
    try {
      const data = localStorage.getItem('salesRanking')
      if (data) {
        const parsed = JSON.parse(data)
        return (parsed.overall?.length || 0) +
          (parsed.tokyo?.length || 0) +
          (parsed.osaka?.length || 0) +
          (parsed.nagoya?.length || 0) +
          (parsed.kikakukaihatsu?.length || 0)
      }
    } catch (e) {
      console.error('Error reading sales data:', e)
    }
    return 0
  }

  const getMasterCount = () => {
    try {
      const data = localStorage.getItem('evaluationMaster')
      return data ? JSON.parse(data).length : 0
    } catch (e) {
      return 0
    }
  }

  const getEvaluationCount = () => {
    try {
      const data = localStorage.getItem('evaluationData')
      return data ? Object.keys(JSON.parse(data)).length : 0
    } catch (e) {
      return 0
    }
  }

  const handleUploadSales = async () => {
    setLoading(true)
    setMessage('')

    try {
      console.log('[DataUpload] Starting sales upload...')
      const salesData = await fetchAllSalesSheets(salesUrl)

      console.log('[DataUpload] salesData received:', salesData)
      onUpload('salesRanking', salesData)

      const totalRecords = (salesData.overall?.length || 0) +
        (salesData.tokyo?.length || 0) +
        (salesData.osaka?.length || 0) +
        (salesData.nagoya?.length || 0) +
        (salesData.kikakukaihatsu?.length || 0)

      console.log('[DataUpload] totalRecords:', totalRecords)
      
      if (totalRecords > 0) {
        setMessage(`✅ 売上ランキングデータを読み込みました（全${totalRecords}件）`)
      } else {
        setMessage('⚠️ データが見つかりませんでした。スプレッドシートの形式を確認してください。')
      }
    } catch (error) {
      console.error('[DataUpload] Error:', error)
      setMessage(`❌ エラー: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadEvaluation = async () => {
    if (!masterUrl || !masterSheetName || !selfEvalUrl || !selfEvalSheetName ||
      !managerEvalUrl || !managerEvalSheetName || !totalScoreUrl || !totalScoreSheetName) {
      setMessage('⚠️ すべての評価データのURLとシート名を入力してください')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const [masterRaw, selfRaw, managerRaw, scoreRaw] = await Promise.all([
        fetchSheetData(masterUrl, masterSheetName),
        fetchSheetData(selfEvalUrl, selfEvalSheetName),
        fetchSheetData(managerEvalUrl, managerEvalSheetName),
        fetchSheetData(totalScoreUrl, totalScoreSheetName)
      ])

      const masterData = convertToStructuredData(masterRaw, 'evaluationMaster')
      const selfData = convertToStructuredData(selfRaw, 'selfEvaluation')
      const managerData = convertToStructuredData(managerRaw, 'managerEvaluation')
      const scoreData = convertToStructuredData(scoreRaw, 'totalScore')

      const mergedData = mergeEvaluationData(masterData, selfData, managerData, scoreData)

      onUpload('evaluationMaster', masterData)
      onUpload('evaluationData', mergedData)

      setMessage('✅ 評価データを読み込みました（4シート統合完了）')
    } catch (error) {
      setMessage(`❌ エラー: ${error.message}`)
      console.error('Evaluation upload error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="data-upload-container">
      <h2>データアップロード</h2>
      <p className="upload-description">
        Google スプレッドシートのURLとシート名を入力してデータを読み込みます。<br />
        ※スプレッドシートは「リンクを知っている全員が閲覧可能」に設定してください。
      </p>

      {message && (
        <div className={`message ${message.includes('エラー') || message.includes('❌') ? 'error' : message.includes('⚠️') ? 'warning' : 'success'}`}>
          {message}
        </div>
      )}

      {/* データビューア */}
      <div className="data-viewer-section">
        <h3>📊 現在読み込まれているデータ</h3>
        <div className="data-viewer-grid">
          <div className="data-viewer-card">
            <span className="data-label">売上ランキング</span>
            <span className="data-count">{getSalesCount()} 件</span>
            <span className="data-sub">5シート統合</span>
          </div>
          <div className="data-viewer-card">
            <span className="data-label">評価マスター</span>
            <span className="data-count">{getMasterCount()} 件</span>
          </div>
          <div className="data-viewer-card">
            <span className="data-label">評価データ</span>
            <span className="data-count">{getEvaluationCount()} 件</span>
            <span className="data-sub">4シート統合</span>
          </div>
        </div>
        <div className="data-viewer-actions">
          <button onClick={() => navigate('/dashboard')} className="view-dashboard-btn">
            📊 ダッシュボードを確認
          </button>
          <button onClick={() => navigate('/evaluation')} className="view-evaluation-btn">
            📋 評価シートを確認
          </button>
        </div>
      </div>

      {/* 売上ランキングデータ */}
      <div className="upload-section">
        <h3>📈 売上ランキングデータ</h3>
        <p className="section-description">
          全体・東京・大阪・名古屋・企画開発の5シートからデータを読み込みます
        </p>
        <div className="input-group">
          <label>スプレッドシートURL</label>
          <input
            type="text"
            value={salesUrl}
            onChange={(e) => setSalesUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
        </div>
        <button
          onClick={handleUploadSales}
          disabled={loading || !salesUrl}
          className="upload-btn sales-btn"
        >
          {loading ? '読み込み中...' : '売上ランキングデータを読み込む'}
        </button>
      </div>

      {/* 評価データ */}
      <div className="upload-section">
        <h3>📋 評価データ</h3>
        <p className="section-description">
          評価マスター・自己評価・部長評価・合計評点の4シートからデータを読み込みます
        </p>

        <div className="input-row">
          <div className="input-group">
            <label>評価マスター URL</label>
            <input
              type="text"
              value={masterUrl}
              onChange={(e) => setMasterUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="input-group small">
            <label>シート名</label>
            <input
              type="text"
              value={masterSheetName}
              onChange={(e) => setMasterSheetName(e.target.value)}
              placeholder="シート1"
            />
          </div>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>自己評価フォーム URL</label>
            <input
              type="text"
              value={selfEvalUrl}
              onChange={(e) => setSelfEvalUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="input-group small">
            <label>シート名</label>
            <input
              type="text"
              value={selfEvalSheetName}
              onChange={(e) => setSelfEvalSheetName(e.target.value)}
              placeholder="フォームの回答1"
            />
          </div>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>部長評価フォーム URL</label>
            <input
              type="text"
              value={managerEvalUrl}
              onChange={(e) => setManagerEvalUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="input-group small">
            <label>シート名</label>
            <input
              type="text"
              value={managerEvalSheetName}
              onChange={(e) => setManagerEvalSheetName(e.target.value)}
              placeholder="フォームの回答_部長"
            />
          </div>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>合計評点 URL</label>
            <input
              type="text"
              value={totalScoreUrl}
              onChange={(e) => setTotalScoreUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="input-group small">
            <label>シート名</label>
            <input
              type="text"
              value={totalScoreSheetName}
              onChange={(e) => setTotalScoreSheetName(e.target.value)}
              placeholder="計算_部長"
            />
          </div>
        </div>

        <button
          onClick={handleUploadEvaluation}
          disabled={loading}
          className="upload-btn evaluation-btn"
        >
          {loading ? '読み込み中...' : '評価データを読み込む（4シート統合）'}
        </button>
      </div>
    </div>
  )
}

export default DataUpload
