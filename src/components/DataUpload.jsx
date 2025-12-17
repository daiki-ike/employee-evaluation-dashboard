import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SHEET_CONFIG } from '../config/sheetConfig'
import './DataUpload.css'

const DataUpload = ({ onUpload, isAutoFetching, onManualReload }) => {
  const navigate = useNavigate()
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

  const handleManualReload = async () => {
    if (onManualReload) {
      setLoading(true)
      await onManualReload()
      setLoading(false)
      setMessage('✅ データの再読み込みが完了しました')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return (
    <div className="data-upload-container">
      <h2>データ接続ステータス</h2>
      <p className="upload-description">
        現在設定されているGoogleスプレッドシートから自動的にデータを読み込んでいます。<br />
        データが反映されていない場合は、「手動更新」ボタンを押してください。
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
          <button
            onClick={handleManualReload}
            className="upload-btn sales-btn"
            disabled={loading || isAutoFetching}
            style={{ width: 'auto', padding: '0.8rem 2rem', fontSize: '1rem' }}
          >
            {loading || isAutoFetching ? '更新中...' : '🔄 最新データを手動更新'}
          </button>
        </div>

        <div className="data-viewer-actions" style={{ marginTop: '1rem' }}>
          <button onClick={() => navigate('/dashboard')} className="view-dashboard-btn">
            📊 ダッシュボードを確認
          </button>
          <button onClick={() => navigate('/evaluation')} className="view-evaluation-btn">
            📋 評価シートを確認
          </button>
        </div>
      </div>

      {/* 設定情報（参照のみ） */}
      <div className="upload-section collapsed">
        <h3>⚙️ 接続設定（書き換え不可）</h3>
        <p className="section-description">
          本番用スプレッドシートへの接続設定です。変更する場合はシステム管理者に連絡してください。
        </p>

        <div className="config-display">
          <div className="config-item">
            <label>売上データURL</label>
            <input type="text" value={SHEET_CONFIG.SALES.URL} readOnly className="readonly-input" />
          </div>
          <div className="config-item">
            <label>評価マスターURL</label>
            <input type="text" value={SHEET_CONFIG.EVALUATION.URL} readOnly className="readonly-input" />
          </div>
          <div className="config-item">
            <label>対象シート名</label>
            <div className="tags">
              {SHEET_CONFIG.SALES.SHEET_NAMES.map(n => <span key={n} className="tag sales">{n}</span>)}
              <span className="tag eval">{SHEET_CONFIG.EVALUATION.SHEETS.MASTER.NAME}</span>
              <span className="tag eval">{SHEET_CONFIG.EVALUATION.SHEETS.SELF_EVAL.NAME}</span>
              <span className="tag eval">{SHEET_CONFIG.EVALUATION.SHEETS.MANAGER_EVAL.NAME}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DataUpload
