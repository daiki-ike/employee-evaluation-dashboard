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

  if (type === 'master') {
    return rawData.slice(1).map(row => ({
      id: row[0],
      name: row[1],
      department: row[2],
      position: row[3],
      role: row[4]
    }))
  }

  if (type === 'evaluation') {
    return rawData
  }

  return rawData
}

/**
 * 評価データをマージ
 */
export const mergeEvaluationData = (existingData, newData) => {
  if (!existingData || existingData.length === 0) return newData
  if (!newData || newData.length === 0) return existingData

  // 新しいデータで既存データを上書き
  const merged = [...existingData]

  newData.forEach(newRow => {
    const existingIndex = merged.findIndex(row => row[0] === newRow[0])
    if (existingIndex >= 0) {
      merged[existingIndex] = newRow
    } else {
      merged.push(newRow)
    }
  })

  return merged
}
