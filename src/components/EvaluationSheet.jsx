import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { convertEvaluationToNumber } from '../utils/sheetsApi'
import './EvaluationSheet.css'

const EvaluationSheet = ({ user, evaluationMaster, evaluationData }) => {
  const [selectedEmployee, setSelectedEmployee] = useState('')

  // 社員リストを取得（evaluationDataのキーから）
  const employees = useMemo(() => {
    if (!evaluationData) return []
    return Object.keys(evaluationData).sort()
  }, [evaluationData])

  // 選択された社員の評価データを整形（rowspan計算付き）
  const employeeEvaluation = useMemo(() => {
    if (!selectedEmployee || !evaluationData || !evaluationMaster) return null

    const employee = evaluationData[selectedEmployee]
    if (!employee) return null

    const evaluations = []

    // デバッグ: evaluationMasterの内容を確認
    console.log('evaluationMaster total rows:', evaluationMaster.length)
    console.log('evaluationMaster first 10 rows:', evaluationMaster.slice(0, 10))

    // evaluationMasterの各行を処理
    evaluationMaster.forEach((row, idx) => {
      // 構造化データ（オブジェクト）を使用
      const questionNo = row.questionNo
      const categoryNo = row.categoryNo
      const criteria = row.criteria
      const majorCategory = row.majorCategory || ''
      const minorCategory = row.minorCategory || ''

      // デバッグ: 最初の10行と最後の5行をログ出力
      if (idx < 10 || idx >= evaluationMaster.length - 5) {
        console.log(`Row ${idx}:`, {
          categoryNo,
          questionNo,
          majorCategory,
          minorCategory,
          criteria
        })
      }

      // 設問番号があり、かつ審査内容が存在する行のみ処理
      if (questionNo && !isNaN(questionNo) && criteria && String(criteria).trim()) {
        // 自己評価と部長評価のテキストを取得（questionNo-1でインデックス指定）
        const selfText = employee.selfAnswers[questionNo - 1] || ''
        const managerText = employee.managerAnswers[questionNo - 1] || ''

        // テキストを数値に変換
        const selfNumeric = convertEvaluationToNumber(selfText)
        const managerNumeric = convertEvaluationToNumber(managerText)

        // 乖離を計算
        const difference = selfNumeric - managerNumeric

        const evaluation = {
          no: questionNo,  // 設問番号を表示用No.として使用
          categoryNo: categoryNo,
          questionNo: questionNo,
          majorCategory,
          majorCategoryDesc: row.majorCategoryDesc || '',
          minorCategory,
          criteria: String(criteria).trim(),
          selfText,
          managerText,
          selfNumeric,
          managerNumeric,
          difference
        }

        // デバッグ: 最初の3件をログ出力
        if (evaluations.length < 3) {
          console.log(`Evaluation ${evaluations.length + 1}:`, evaluation)
        }

        evaluations.push(evaluation)
      }
    })

    console.log('Total evaluations processed:', evaluations.length)

    return {
      name: employee.name,
      department: employee.department,
      totalScore: employee.totalScore,
      evaluations
    }
  }, [selectedEmployee, evaluationData, evaluationMaster])

  // サマリー統計
  const summary = useMemo(() => {
    if (!employeeEvaluation) return null

    const evaluations = employeeEvaluation.evaluations
    if (!evaluations || evaluations.length === 0) {
      return {
        avgDifference: '0.00',
        maxDifference: '0.00',
        questionCount: 0
      }
    }
    const avgDifference = evaluations.reduce((sum, item) => sum + Math.abs(item.difference), 0) / evaluations.length
    const maxDifference = Math.max(...evaluations.map(item => Math.abs(item.difference)))

    return {
      avgDifference: avgDifference.toFixed(2),
      maxDifference: maxDifference.toFixed(2),
      questionCount: evaluations.length
    }
  }, [employeeEvaluation])

  // 評価データを表示用に加工（行結合のための計算）
  const processedEvaluations = useMemo(() => {
    if (!employeeEvaluation) return []

    const data = employeeEvaluation.evaluations
    const processed = []

    // 行結合の計算
    // 同じCategoryNo, MajorCategory, MinorCategoryが続く場合、rowSpanを設定
    for (let i = 0; i < data.length; i++) {
      const current = data[i]
      const prev = i > 0 ? data[i - 1] : null

      // CategoryNoの結合判定
      let catRowSpan = 1
      if (!prev || current.categoryNo !== prev.categoryNo) {
        for (let j = i + 1; j < data.length; j++) {
          if (data[j].categoryNo === current.categoryNo) {
            catRowSpan++
          } else {
            break
          }
        }
      } else {
        catRowSpan = 0 // 結合される側は0
      }

      // MajorCategoryの結合判定（CategoryNoが同じ範囲内で）
      let majorRowSpan = 1
      if (!prev || current.majorCategory !== prev.majorCategory || current.categoryNo !== prev.categoryNo) {
        for (let j = i + 1; j < data.length; j++) {
          if (data[j].majorCategory === current.majorCategory && data[j].categoryNo === current.categoryNo) {
            majorRowSpan++
          } else {
            break
          }
        }
      } else {
        majorRowSpan = 0
      }

      // MinorCategoryの結合判定（MajorCategoryが同じ範囲内で）
      let minorRowSpan = 1
      if (!prev || current.minorCategory !== prev.minorCategory || current.majorCategory !== prev.majorCategory) {
        for (let j = i + 1; j < data.length; j++) {
          if (data[j].minorCategory === current.minorCategory && data[j].majorCategory === current.majorCategory) {
            minorRowSpan++
          } else {
            break
          }
        }
      } else {
        minorRowSpan = 0
      }

      processed.push({
        ...current,
        catRowSpan,
        majorRowSpan,
        minorRowSpan
      })
    }

    return processed
  }, [employeeEvaluation])

  if (!user) return <Navigate to="/login" />

  // データ自体がない場合
  if (!evaluationData || !evaluationMaster || Object.keys(evaluationData).length === 0) {
    return (
      <div className="evaluation-container">
        <header className="dashboard-header">
          <h2>評価シート</h2>
          <Link to="/dashboard" className="back-link">ダッシュボード</Link>
        </header>
        <div className="no-data">
          <p>データがありません</p>
          {user.role === 'admin' && (
            <Link to="/upload" className="upload-link">データをアップロード</Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="evaluation-container">
      <header className="dashboard-header">
        <h2>評価シート</h2>
        <Link to="/dashboard" className="back-link">ダッシュボード</Link>
      </header>

      <div className="employee-selector">
        <label>社員を選択</label>
        <select
          value={selectedEmployee}
          onChange={(e) => setSelectedEmployee(e.target.value)}
          className="employee-select"
        >
          <option value="">-- 社員を選択してください --</option>
          {Object.keys(evaluationData).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {!selectedEmployee ? (
        <div className="no-selection">
          <p>社員を選択してください</p>
        </div>
      ) : !employeeEvaluation ? (
        <div className="no-data">
          <p>この社員の評価データが見つかりません</p>
        </div>
      ) : (
        <>
          <div className="employee-header">
            <div className="employee-info">
              <h3>{employeeEvaluation.name}</h3>
              <p>{employeeEvaluation.department}</p>
            </div>
            <div className="total-score">
              <span className="score-label">合計評価点</span>
              <span className="score-value">{(employeeEvaluation.totalScore || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <h4>平均乖離</h4>
              <span className={`summary-value ${summary.avgDifference > 0 ? 'positive' : summary.avgDifference < 0 ? 'negative' : ''}`}>
                {summary.avgDifference > 0 ? '+' : ''}{summary.avgDifference}
              </span>
            </div>
            <div className="summary-card">
              <h4>最大乖離</h4>
              <span className={`summary-value ${summary.maxDifference > 0 ? 'positive' : summary.maxDifference < 0 ? 'negative' : ''}`}>
                {summary.maxDifference > 0 ? '+' : ''}{summary.maxDifference}
              </span>
            </div>
          </div>

          <div className="legend-container">
            <div className="legend-item">
              <h4>比較グラフの見方</h4>
              <div className="legend-row">
                <span className="legend-marker self">●</span>
                <span>自己評価</span>
              </div>
              <div className="legend-row">
                <span className="legend-marker manager">▲</span>
                <span>部長評価</span>
              </div>
              <div className="legend-row">
                <span className="legend-marker match">◆</span>
                <span>一致</span>
              </div>
            </div>
            <div className="legend-item">
              <h4>乖離の意味</h4>
              <div className="legend-desc">
                <span className="diff-example positive">+2.0</span>
                <span>自己評価の方が高い（自己評価過大の可能性）</span>
              </div>
              <div className="legend-desc">
                <span className="diff-example negative">-2.0</span>
                <span>部長評価の方が高い（自己評価過小の可能性）</span>
              </div>
              <div className="legend-desc">
                <span className="diff-example zero">0.0</span>
                <span>自己評価と部長評価が一致</span>
              </div>
            </div>
          </div>

          <div className="evaluation-table-container">
            <h3>詳細評価（全{employeeEvaluation.evaluations.length}問）</h3>
            <table className="evaluation-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>カテゴリー</th>
                  <th style={{ width: '150px' }}>大カテゴリ</th>
                  <th style={{ width: '120px' }}>中カテゴリ</th>
                  <th>審査内容</th>
                  <th style={{ width: '140px' }}>自己評価</th>
                  <th style={{ width: '140px' }}>部長評価</th>
                  <th style={{ width: '80px' }}>乖離</th>
                  <th style={{ width: '150px' }}>比較グラフ</th>
                </tr>
              </thead>
              <tbody>
                {processedEvaluations.map((item, index) => (
                  <tr key={index}>
                    {item.catRowSpan > 0 && (
                      <td rowSpan={item.catRowSpan} className="category-cell no-cell">
                        {item.categoryNo}
                      </td>
                    )}
                    {item.majorRowSpan > 0 && (
                      <td rowSpan={item.majorRowSpan} className="category-cell major-cell">
                        <div className="major-title">{item.majorCategory}</div>
                        {item.majorCategoryDesc && (
                          <div className="major-desc">{item.majorCategoryDesc}</div>
                        )}
                      </td>
                    )}
                    {item.minorRowSpan > 0 && (
                      <td rowSpan={item.minorRowSpan} className="category-cell minor-cell">
                        {item.minorCategory}
                      </td>
                    )}
                    <td className="criteria-cell">{item.criteria}</td>
                    <td className="score-cell">
                      <div className="score-text">{item.selfText}</div>
                      <div className="score-num">({item.selfNumeric})</div>
                    </td>
                    <td className="score-cell">
                      <div className="score-text">{item.managerText}</div>
                      <div className="score-num">({item.managerNumeric})</div>
                    </td>
                    <td className="diff-cell">
                      <span className={`diff-badge ${item.difference > 0 ? 'positive' : item.difference < 0 ? 'negative' : 'neutral'}`}>
                        {item.difference > 0 ? '+' : ''}{item.difference.toFixed(1)}
                      </span>
                    </td>
                    <td className="chart-cell">
                      {(() => {
                        // 0の場合は1として表示（スケール外にならないよう）
                        const selfPos = Math.max(1, Math.min(5, item.selfNumeric))
                        const mgrPos = Math.max(1, Math.min(5, item.managerNumeric))
                        const selfLeft = (selfPos - 1) * 25
                        const mgrLeft = (mgrPos - 1) * 25
                        const minLeft = Math.min(selfLeft, mgrLeft)
                        const gapWidth = Math.abs(selfLeft - mgrLeft)

                        return (
                          <div className="scale-chart">
                            {/* スケールライン 1-5 */}
                            <div className="scale-line">
                              {[1, 2, 3, 4, 5].map(n => (
                                <div key={n} className="scale-tick" style={{ left: `${(n - 1) * 25}%` }}>
                                  <span className="tick-label">{n}</span>
                                </div>
                              ))}
                            </div>
                            {/* マーカー表示 */}
                            {selfPos === mgrPos ? (
                              // 一致: ダイヤモンドマーカー
                              <div
                                className="marker match"
                                style={{ left: `${selfLeft}%` }}
                                title={`一致: ${item.selfNumeric}`}
                              >◆</div>
                            ) : (
                              // 乖離あり: 2つのマーカーを線で結ぶ
                              <>
                                <div
                                  className="gap-line"
                                  style={{ left: `${minLeft}%`, width: `${gapWidth}%` }}
                                />
                                <div
                                  className="marker self"
                                  style={{ left: `${selfLeft}%` }}
                                  title={`自己: ${item.selfNumeric}`}
                                >●</div>
                                <div
                                  className="marker manager"
                                  style={{ left: `${mgrLeft}%` }}
                                  title={`部長: ${item.managerNumeric}`}
                                >▲</div>
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default EvaluationSheet
