import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSheetData, convertToStructuredData, mergeEvaluationData, fetchAllSalesSheets } from '../utils/sheetsApi'
import './DataUpload.css'

const DataUpload = ({ onUpload }) => {
  const navigate = useNavigate()

  // 売上データ
  const [salesUrl, setSalesUrl] = useState('https://docs.google.com/spreadsheets/d/1BbjL9FuF3bdItknQGIWQFO3R_7pehAVIHHh1-A9-xYc/edit?usp=sharing')

  // 評価マスター
  const [masterUrl, setMasterUrl] = useState('https://docs.google.com/spreadsheets/d/1xi024jxqTOmta-iABi3IuCPv718Y0EBBfESSke9K94c/edit?usp=sharing')
  const [masterSheetName, setMasterSheetName] = useState('シート1')

  // 自己評価フォーム
  const [selfEvalUrl, setSelfEvalUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXefR1ixZtbljVRDc8/')
  const [selfEvalSheetName, setSelfEvalSheetName] = useState('フォームの回答1')

  // 部長評価フォーム
  const [managerEvalUrl, setManagerEvalUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXefR1ixZtbljVRDc8/')
  const [managerEvalSheetName, setManagerEvalSheetName] = useState('フォームの回答_部長')

  // 合計評価点
  const [totalScoreUrl, setTotalScoreUrl] = useState('https://docs.google.com/spreadsheets/d/1Dgk5tzbb1ugMwO9Aj14TsSmHlgXefR1ixZtbljVRDc8/')
  const [totalScoreSheetName, setTotalScoreSheetName] = useState('計算_部長')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [debugSalesData, setDebugSalesData] = useState('')

  const checkSalesStorage = () => {
    const data = localStorage.getItem('salesRanking')
    if (data) {
      const parsed = JSON.parse(data)
      const info = {
        overallCount: parsed.overall?.length || 0,
        tokyoCount: parsed.tokyo?.length || 0,
        osakaCount: parsed.osaka?.length || 0,
        nagoyaCount: parsed.nagoya?.length || 0,
        hatakeyamaCount: parsed.hatakeyama?.length || 0,
        firstOverallRecord: parsed.overall?.[0] || 'No record'
      }
      setDebugSalesData(JSON.stringify(info, null, 2))
    } else {
      setDebugSalesData('No data found in localStorage')
    }
  }

  const handleUploadSales = async () => {
    if (!salesUrl) {
      setMessage('売上データのURLを入力してください')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const salesData = await fetchAllSalesSheets(salesUrl)

      if (salesData.errors.length > 0) {
        console.warn('Some sheets failed to load:', salesData.errors)
      }

      console.log('DataUpload: salesData before onUpload:', salesData)
      onUpload('salesRanking', salesData)

      const totalRecords = salesData.overall.length + salesData.tokyo.length +
        salesData.osaka.length + salesData.nagoya.length +
        salesData.hatakeyama.length

      console.log('DataUpload: totalRecords calculated:', totalRecords)
      setMessage(`売上ランキングデータを読み込みました (全${totalRecords}件)`)
    } catch (error) {
      setMessage(`エラー: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadEvaluation = async () => {
    if (!masterUrl || !masterSheetName || !selfEvalUrl || !selfEvalSheetName ||
      !managerEvalUrl || !managerEvalSheetName || !totalScoreUrl || !totalScoreSheetName) {
      setMessage('すべての評価データのURLとシート名を入力してください')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      // 4つのシートを並行して読み込み
      const [masterRaw, selfRaw, managerRaw, scoreRaw] = await Promise.all([
        fetchSheetData(masterUrl, masterSheetName),
        fetchSheetData(selfEvalUrl, selfEvalSheetName),
        fetchSheetData(managerEvalUrl, managerEvalSheetName),
        fetchSheetData(totalScoreUrl, totalScoreSheetName)
      ])

      // データを構造化
      const masterData = convertToStructuredData(masterRaw, 'evaluationMaster')
      const selfData = convertToStructuredData(selfRaw, 'selfEvaluation')
      const managerData = convertToStructuredData(managerRaw, 'managerEvaluation')
      const scoreData = convertToStructuredData(scoreRaw, 'totalScore')

      // データをマージ
      const mergedData = mergeEvaluationData(masterData, selfData, managerData, scoreData)

      // 評価マスターと統合データを個別に保存
      onUpload('evaluationMaster', masterData)
      onUpload('evaluationData', mergedData)

      setMessage('評価データを読み込みました（4シート統合完了）')
    } catch (error) {
      setMessage(`エラー: ${error.message}`)
      console.error('Evaluation upload error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="data-upload-container">
      <h2>データアップロード</h2>
      <p className="upload-description">
        Google スプレッドシートのURLとシート名を入力してデータを読み込みます。
        <br />
        ※スプレッドシートは「リンクを知っている全員が閲覧可能」に設定してください。
      </p>

      {message && (
        <div className={`message ${message.includes('エラー') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* データビューア */}
      <div className="data-viewer-section">
        <h3>📊 現在読み込まれているデータ</h3>
        <div className="data-viewer-grid">
          <div className="data-viewer-card">
            <div className="data-viewer-label">売上ランキングデータ</div>
            <div className="data-viewer-value">
              {(() => {
                const data = localStorage.getItem('salesRanking')
                if (!data) return '未読み込み'
                const parsed = JSON.parse(data)
                const total = (parsed.overall?.length || 0) + (parsed.tokyo?.length || 0) +
                  (parsed.osaka?.length || 0) + (parsed.nagoya?.length || 0) +
                  (parsed.hatakeyama?.length || 0)
                return `${total} 件 (5シート)`
              })()}
            </div>
          </div>
          <div className="data-viewer-card">
            <div className="data-viewer-label">評価マスター</div>
            <div className="data-viewer-value">
              {(() => {
                const data = localStorage.getItem('evaluationMaster')
                return data ? `${JSON.parse(data).length} 件` : '未読み込み'
              })()}
            </div>
          </div>
          <div className="data-viewer-card">
            <div className="data-viewer-label">評価データ（4シート統合）</div>
            <div className="data-viewer-value">
              {(() => {
                const data = localStorage.getItem('evaluationData')
                return data ? `${JSON.parse(data).length} 件` : '未読み込み'
              })()}
            </div>
          </div>
        </div>

        {/* ナビゲーションボタン */}
        <div className="navigation-buttons">
          <button
            onClick={() => navigate('/dashboard')}
            className="nav-btn nav-btn-primary"
          >
            📊 ダッシュボードを確認
          </button>
          <button
            onClick={() => navigate('/evaluation')}
            className="nav-btn nav-btn-secondary"
          >
            📋 評価シートを確認
          </button>
        </div>
      </div>

      <div className="upload-section">
        <h3>1. 売上ランキングデータ（5シート一括読み込み）</h3>
        <p className="section-description">
          全体、東京、大阪、名古屋、畠山部の5シートを一度に読み込みます
        </p>
        <div className="form-group">
          <label>スプレッドシートURL</label>
          <input
            type="text"
            value={salesUrl}
            onChange={(e) => setSalesUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
        </div>
        <button onClick={handleUploadSales} disabled={loading} className="upload-btn">
          {loading ? '読み込み中...' : '売上ランキングデータを読み込む'}
        </button>
      </div>

      <div className="upload-section">
        <h3>2. 評価データ（4シート統合）</h3>
        <p className="section-description">以下の4つのシートを読み込んでマージします</p>

        {/* デバッグ表示 */}
        <div className="debug-section" style={{ marginTop: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '5px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>デバッグ情報（評価マスター）</h4>
          <p>読み込み状況を確認できます</p>
          <button
            onClick={() => {
              const data = localStorage.getItem('evaluationMaster')
              if (data) {
                const parsed = JSON.parse(data)
                alert(`データ件数: ${parsed.length}件\n先頭データ: ${JSON.stringify(parsed[0], null, 2)}`)
                console.log('Debug Master Data:', parsed)
              } else {
                alert('評価マスターデータが保存されていません')
              }
            }}
            style={{ padding: '5px 10px', background: '#333', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            保存されたデータを確認
          </button>
          <button
            onClick={async () => {
              if (!masterUrl || !masterSheetName) {
                alert('URLとシート名を入力してください')
                return
              }
              try {
                alert('データを取得中...')
                const raw = await fetchSheetData(masterUrl, masterSheetName)
                console.log('Raw Data:', raw)
                if (raw && raw.length > 0) {
                  const headers = raw[0]
                  const firstRow = raw.length > 1 ? raw[1] : 'データなし'
                  alert(`取得成功！\n全行数: ${raw.length}\n\nヘッダー(1行目):\n${JSON.stringify(headers)}\n\nデータ(2行目):\n${JSON.stringify(firstRow)}`)
                } else {
                  alert('データが取得できましたが、空です (0件)')
                }
              } catch (e) {
                alert(`取得エラー: ${e.message}`)
              }
            }}
            style={{ padding: '5px 10px', background: '#667eea', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', marginLeft: '10px' }}
          >
            スプレッドシートから直接確認
          </button>
        </div>

        <div className="subsection">
          <h4>2-1. 評価マスターシート</h4>
          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={masterUrl}
              onChange={(e) => setMasterUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="form-group">
            <label>シート名</label>
            <input
              type="text"
              value={masterSheetName}
              onChange={(e) => setMasterSheetName(e.target.value)}
              placeholder="例: 評価マスターシート"
            />
          </div>
        </div>

        <div className="subsection">
          <h4>2-2. 自己評価フォーム回答</h4>
          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={selfEvalUrl}
              onChange={(e) => setSelfEvalUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="form-group">
            <label>シート名</label>
            <input
              type="text"
              value={selfEvalSheetName}
              onChange={(e) => setSelfEvalSheetName(e.target.value)}
              placeholder="例: フォームの回答1"
            />
          </div>
        </div>

        <div className="subsection">
          <h4>2-3. 部長評価フォーム回答</h4>
          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={managerEvalUrl}
              onChange={(e) => setManagerEvalUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="form-group">
            <label>シート名</label>
            <input
              type="text"
              value={managerEvalSheetName}
              onChange={(e) => setManagerEvalSheetName(e.target.value)}
              placeholder="例: フォームの回答_部長"
            />
          </div>
        </div>

        <div className="subsection">
          <h4>2-4. 合計評価点（計算_部長）</h4>
          <div className="form-group">
            <label>URL</label>
            <input
              type="text"
              value={totalScoreUrl}
              onChange={(e) => setTotalScoreUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <div className="form-group">
            <label>シート名</label>
            <input
              type="text"
              value={totalScoreSheetName}
              onChange={(e) => setTotalScoreSheetName(e.target.value)}
              placeholder="例: 計算_部長"
            />
          </div>
        </div>

        <button onClick={handleUploadEvaluation} disabled={loading} className="upload-btn">
          {loading ? '読み込み中...' : '評価データを読み込む（4シート統合）'}
        </button>
      </div>
    </div >
  )
}

export default DataUpload
