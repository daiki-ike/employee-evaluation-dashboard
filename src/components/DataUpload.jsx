import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SHEET_CONFIG } from '../config/sheetConfig'
import { fetchSheetData, convertToStructuredData, mergeEvaluationData } from '../utils/sheetsApi'
import { fetchAllSalesSheets } from '../utils/salesApi'
import './DataUpload.css'

const DataUpload = ({ onUpload, isAutoFetching, onManualReload }) => {
  const navigate = useNavigate()

  // 状態としてURLを管理（初期値はConfigから取得）
  const [salesUrl, setSalesUrl] = useState(SHEET_CONFIG.SALES.URL)
  const [masterUrl, setMasterUrl] = useState(SHEET_CONFIG.EVALUATION.URL)

  // シート名はConfigの値をデフォルトにするが、変更可能に
  const [sheetNames, setSheetNames] = useState({
    master: SHEET_CONFIG.EVALUATION.SHEETS.MASTER.NAME,
    self: SHEET_CONFIG.EVALUATION.SHEETS.SELF_EVAL.NAME,
    manager: SHEET_CONFIG.EVALUATION.SHEETS.MANAGER_EVAL.NAME,
    score: SHEET_CONFIG.EVALUATION.SHEETS.TOTAL_SCORE.NAME
  })

  // URL変更用（全評価URLを連動させるための簡易ハンドラ）
  const handleMasterUrlChange = (e) => {
    setMasterUrl(e.target.value)
  }

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

  const handleManualUploadSales = async () => {
    setLoading(true)
    setMessage('')
    try {
      console.log('[DataUpload] Manual Sales Upload from:', salesUrl)
      const salesData = await fetchAllSalesSheets(salesUrl, SHEET_CONFIG.SALES.SHEET_NAMES)
      onUpload('salesRanking', salesData)
      setMessage('✅ 売上データを手動で読み込みました')
    } catch (error) {
      console.error('[DataUpload] Error:', error)
      setMessage(`❌ エラー: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleManualUploadEval = async () => {
    setLoading(true)
    setMessage('')
    try {
      console.log('[DataUpload] Manual Eval Upload from:', masterUrl)
      // Configの構造を利用しつつ、URLは入力されたものを使用
      const results = await Promise.allSettled([
        fetchSheetData(masterUrl, sheetNames.master),
        fetchSheetData(masterUrl, sheetNames.self),
        fetchSheetData(masterUrl, sheetNames.manager),
        fetchSheetData(masterUrl, sheetNames.score)
      ])

      const [masterRaw, selfRaw, managerRaw, scoreRaw] = results

      if (masterRaw.status === 'fulfilled') {
        const masterData = convertToStructuredData(masterRaw.value, 'evaluationMaster')
        onUpload('evaluationMaster', masterData)

        const selfData = selfRaw.status === 'fulfilled' ? convertToStructuredData(selfRaw.value, 'selfEvaluation') : {}
        const managerData = managerRaw.status === 'fulfilled' ? convertToStructuredData(managerRaw.value, 'managerEvaluation') : {}
        const scoreData = scoreRaw.status === 'fulfilled' ? convertToStructuredData(scoreRaw.value, 'totalScore') : {}

        const mergedData = mergeEvaluationData(masterData, selfData, managerData, scoreData)
        onUpload('evaluationData', mergedData)

        setMessage(`✅ 評価データを手動で読み込みました（社員${Object.keys(mergedData).length}名）`)
      } else {
        throw new Error('評価マスターの読み込みに失敗しました')
      }
    } catch (error) {
      console.error('[DataUpload] Error:', error)
      setMessage(`❌ エラー: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleManualReload = async () => {
    if (onManualReload) {
      setLoading(true)
      await onManualReload()
      setLoading(false)
      setMessage('✅ 本番データの自動再読み込みが完了しました')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div className="data-upload-container">
      <h2>データ接続ステータス</h2>
      <p className="upload-description">
        現在設定されているGoogleスプレッドシートから自動的にデータを読み込んでいます。<br />
        データが反映されていない場合は、「手動更新（本番再取得）」または下の「手動データ読み込み（任意URL）」を利用してください。
      </p>

      {(message || isAutoFetching) && (
        <div className={`message ${isAutoFetching ? 'info' : message.includes('エラー') ? 'error' : 'success'}`}>
          {isAutoFetching ? '🔄 スプレッドシートから最新データを取得中...' : message}
        </div>
      )}

      {/* データビューア */}
      <div className="data-viewer-section">
        <h3>📊 現在のデータ状況</h3>
        <div className="data-viewer-grid">
          <div className="data-viewer-card">
            <span className="data-label">売上ランキング</span>
            <span className="data-count">{getSalesCount()} 件</span>
          </div>
          <div className="data-viewer-card">
            <span className="data-label">評価マスター</span>
            <span className="data-count">{getMasterCount()} 件</span>
          </div>
          <div className="data-viewer-card">
            <span className="data-label">評価データ</span>
            <span className="data-count">{getEvaluationCount()} 件</span>
          </div>
        </div>

        <div className="data-viewer-actions">
          <button
            onClick={handleManualReload}
            className="upload-btn sales-btn"
            disabled={loading || isAutoFetching}
            style={{ width: 'auto', padding: '0.8rem 2rem', fontSize: '1rem', marginBottom: '1rem' }}
          >
            {loading || isAutoFetching ? '更新中...' : '🔄 本番データを再取得'}
          </button>
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

      {/* 手動読み込みセクション */}
      <div className="upload-section">
        <h3>⚙️ 手動データ読み込み（テスト用）</h3>
        <p className="section-description">
          URLを書き換えることで、一時的に別のスプレッドシート（テスト用など）を読み込ませることができます。<br />
          <small>※URLを空欄にして「本番用URLに戻す」機能はありません。ページをリロードすると本番用に戻ります。</small>
        </p>

        <div className="config-group">
          <h4>📈 売上データ設定</h4>
          <div className="input-group">
            <label>スプレッドシートURL</label>
            <input
              type="text"
              value={salesUrl}
              onChange={(e) => setSalesUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/..."
            />
          </div>
          <button
            onClick={handleManualUploadSales}
            disabled={loading || isAutoFetching}
            className="upload-btn sales-btn mini-btn"
          >
            売上データを読み込む
          </button>
        </div>

        <div className="config-group" style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <h4>📋 評価データ設定</h4>
          <div className="input-group">
            <label>スプレッドシートURL (全シート共通)</label>
            <input
              type="text"
              value={masterUrl}
              onChange={handleMasterUrlChange}
              placeholder="https://docs.google.com/spreadsheets/..."
            />
          </div>
          <div className="tags-input-area">
            <label>対象シート名 check:</label>
            <div className="tags">
              <span className="tag eval">{sheetNames.master}</span>
              <span className="tag eval">{sheetNames.self}</span>
              <span className="tag eval">{sheetNames.manager}</span>
            </div>
          </div>
          <button
            onClick={handleManualUploadEval}
            disabled={loading || isAutoFetching}
            className="upload-btn evaluation-btn mini-btn"
          >
            評価データを読み込む
          </button>
        </div>
      </div>
    </div>
  )
}

export default DataUpload
