// sheetsApi.js - Evaluation Sheet API utilities (評価シート専用)

/**
 * Google Sheets の公開URLからスプレッドシートIDを抽出
 */
export const extractSpreadsheetId = (url) => {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Google Visualization API を使用してシートデータを取得
 */
export const fetchSheetData = async (spreadsheetUrl, sheetName) => {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
  if (!spreadsheetId) {
    throw new Error('Invalid spreadsheet URL')
  }

  const encodedSheetName = encodeURIComponent(sheetName)
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodedSheetName}`

  console.log('[fetchSheetData] Fetching:', sheetName)
  console.log('[fetchSheetData] URL:', url)

  const response = await fetch(url)
  const text = await response.text()

  console.log('[fetchSheetData] Response length:', text.length, 'chars')

  // Google Visualization API のレスポンスをパース
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
  if (!jsonMatch) {
    throw new Error('Failed to parse Google Sheets response')
  }

  const json = JSON.parse(jsonMatch[1])

  if (json.status === 'error') {
    throw new Error(json.errors?.[0]?.detailed_message || 'Unknown error')
  }

  const table = json.table
  console.log('[fetchSheetData] Columns:', table.cols?.length)
  console.log('[fetchSheetData] Total rows from API:', table.rows?.length)

  // データを2次元配列に変換
  const data = table.rows.map(row =>
    row.c.map(cell => {
      if (!cell) return null
      // フォーマット済みの値があればそれを使用、なければ生の値
      return cell.f !== undefined ? cell.f : cell.v
    })
  )

  if (data.length > 0) {
    console.log('[fetchSheetData] First row raw:', JSON.stringify(table.rows[0].c.slice(0, 8)))
  }
  console.log(`[fetchSheetData] ${sheetName}: ${data.length} rows converted`)
  if (data.length > 0) {
    console.log('[fetchSheetData] First row converted:', data[0])
  }

  return data
}

/**
 * 評価マスターデータを取得
 */
export const fetchMasterData = async (spreadsheetUrl, sheetName) => {
  const data = await fetchSheetData(spreadsheetUrl, sheetName)

  // ヘッダー行をスキップしてデータを返す
  return data.slice(1).map(row => ({
    id: row[0],
    name: row[1],
    department: row[2],
    position: row[3],
    role: row[4]
  }))
}

/**
 * 評価データを取得
 */
export const fetchEvaluationData = async (spreadsheetUrl, sheetName, type = 'raw') => {
  const rawData = await fetchSheetData(spreadsheetUrl, sheetName)

  if (type === 'raw') {
    return rawData
  } else if (type === 'totalScore') {
    return rawData.slice(1).map(row => ({
      name: row[1],
      totalScore: parseFloat(row[169]) || 0
    }))
  }

  return rawData
}

/**
 * 評価マスターデータをローカルストレージに保存
 */
export const saveMasterDataToStorage = (data) => {
  localStorage.setItem('masterData', JSON.stringify(data))
}

/**
 * 評価マスターデータをローカルストレージから取得
 */
export const getMasterDataFromStorage = () => {
  const stored = localStorage.getItem('masterData')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * 評価データをローカルストレージに保存
 */
export const saveEvaluationDataToStorage = (data) => {
  localStorage.setItem('evaluationData', JSON.stringify(data))
}

/**
 * 評価データをローカルストレージから取得
 */
export const getEvaluationDataFromStorage = () => {
  const stored = localStorage.getItem('evaluationData')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * 評価文字列を数値に変換
 */
export const convertEvaluationToNumber = (evaluation) => {
  const mapping = {
    'S': 5,
    'A': 4,
    'B': 3,
    'C': 2,
    'D': 1,
    '': 0,
    null: 0,
    undefined: 0
  }
  return mapping[evaluation] !== undefined ? mapping[evaluation] : 0
}

/**
 * 生データを構造化データに変換
 */
export const convertToStructuredData = (rawData, type) => {
  if (!rawData || rawData.length === 0) return []

  console.log(`[convertToStructuredData] type=${type}, rows=${rawData.length}`)
  if (rawData.length > 0) {
    console.log(`[convertToStructuredData] First row sample:`, rawData[0]?.slice(0, 5))
  }

  // 評価マスター: 設問定義
  // A列: カテゴリー番号, B列: 設問番号, C列: 大項目, D列: 評価方法, E列: 中項目, F列: 審査内容
  if (type === 'master' || type === 'evaluationMaster') {
    const result = []
    let skippedCount = 0

    // 最初の10行の詳細をログ
    console.log('[convertToStructuredData] === First 10 rows detail ===')
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i]
      console.log(`  Row ${i}: cols=${row?.length}, [0]=${row?.[0]}, [1]=${row?.[1]}, [2]=${String(row?.[2] || '').substring(0, 20)}, [5]=${String(row?.[5] || '').substring(0, 20)}`)
    }

    rawData.forEach((row, idx) => {
      if (!row) {
        skippedCount++
        return
      }

      // 設問番号をB列から取得、なければ連番を使用
      let questionNo = parseInt(row[1])
      if (isNaN(questionNo) || questionNo <= 0) {
        // B列が空の場合、A列のカテゴリ番号とインデックスから推測
        // または単純に連番を振る
        questionNo = result.length + 1
      }

      // 審査内容を取得（F列 = index 5）- これが設問のテキスト
      const criteria = String(row[5] || '').trim()
      const majorCategory = String(row[2] || '').trim()
      const minorCategory = String(row[4] || '').trim()

      // ヘッダー行チェック
      const isHeader = String(row[0] || '').includes('カテゴリ') ||
                       String(row[1] || '').includes('設問') ||
                       String(row[2] || '').includes('大項目')

      // 審査内容(criteria)がある行のみを有効な設問として処理
      // criteriaが空の行はカテゴリ見出し行の可能性が高い
      if (criteria && !isHeader) {
        result.push({
          questionNo: questionNo,
          categoryNo: row[0],
          majorCategory: majorCategory,
          majorCategoryDesc: String(row[3] || '').trim(),
          minorCategory: minorCategory,
          criteria: criteria
        })

        if (result.length <= 5) {
          console.log(`[convertToStructuredData] Master Q${result.length}:`, {
            questionNo,
            categoryNo: row[0],
            majorCategory: majorCategory.substring(0, 15),
            criteria: criteria.substring(0, 30)
          })
        }
      } else {
        skippedCount++
        // 最初の5件のスキップされた行をログ（デバッグ用）
        if (skippedCount <= 5) {
          console.log(`[convertToStructuredData] Skipped row ${idx}: criteria="${criteria.substring(0, 20)}", isHeader=${isHeader}`)
        }
      }
    })

    console.log(`[convertToStructuredData] evaluationMaster: ${result.length} questions extracted, ${skippedCount} rows skipped`)
    return result
  }

  // 自己評価・部長評価フォームの回答: B列が名前、D列〜CF列が回答（2行目からデータ）
  if (type === 'selfEvaluation' || type === 'managerEvaluation') {
    const result = {}
    // ヘッダー行(row 0)をスキップ、row 1から処理
    rawData.slice(1).forEach((row, idx) => {
      const name = String(row[1] || '').trim() // B列 = index 1
      if (name && name !== '氏名' && name !== '名前') {
        // D列(index 3)からCF列までが回答データ
        const answers = row.slice(3)
        result[name] = {
          name: name,
          answers: answers
        }
        if (idx < 3) {
          console.log(`[convertToStructuredData] ${type}: ${name}, answers count: ${answers.length}, first 5:`, answers.slice(0, 5))
        }
      }
    })
    console.log(`[convertToStructuredData] ${type}: ${Object.keys(result).length} employees`)
    return result
  }

  // 合計評点: B列が名前、特定列が評点
  if (type === 'totalScore') {
    const result = {}
    rawData.slice(1).forEach((row, idx) => {
      const name = String(row[1] || '').trim() // B列 = index 1
      // 合計評点は最後の方の列にあることが多い
      // まずは全行をログして確認
      if (idx < 3) {
        console.log(`[convertToStructuredData] totalScore row ${idx}: name=${name}, cols=${row.length}`)
      }
      if (name && name !== '氏名' && name !== '名前') {
        // 評点を探す（数値が入っている最後の列を探す）
        let score = 0
        for (let i = row.length - 1; i >= 2; i--) {
          const val = parseFloat(row[i])
          if (!isNaN(val) && val > 0 && val < 1000) {
            score = val
            break
          }
        }
        result[name] = score
      }
    })
    console.log(`[convertToStructuredData] totalScore: ${Object.keys(result).length} employees`)
    return result
  }

  return rawData
}

/**
 * 評価データをマージ（4つのデータソースを統合）
 */
export const mergeEvaluationData = (masterData, selfData, managerData, scoreData) => {
  console.log('[mergeEvaluationData] Starting merge...')
  console.log('[mergeEvaluationData] selfData keys:', Object.keys(selfData || {}).slice(0, 5))
  console.log('[mergeEvaluationData] managerData keys:', Object.keys(managerData || {}).slice(0, 5))
  console.log('[mergeEvaluationData] scoreData keys:', Object.keys(scoreData || {}).slice(0, 5))

  // 全社員名を収集
  const allNames = new Set([
    ...Object.keys(selfData || {}),
    ...Object.keys(managerData || {}),
    ...Object.keys(scoreData || {})
  ])

  console.log('[mergeEvaluationData] All employee names:', [...allNames].slice(0, 10))

  const result = {}

  allNames.forEach(name => {
    if (!name || name === '氏名' || name === '名前') return

    result[name] = {
      name: name,
      department: '', // マスターから取得する場合は別途対応
      selfAnswers: selfData?.[name]?.answers || [],
      managerAnswers: managerData?.[name]?.answers || [],
      totalScore: scoreData?.[name] || 0
    }
  })

  console.log('[mergeEvaluationData] Result:', Object.keys(result).length, 'employees')

  return result
}
