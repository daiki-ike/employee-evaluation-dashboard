// Google Sheets APIを使ってデータを取得する関数（CSV形式で全データ取得）

export const fetchSheetData = async (spreadsheetUrl, sheetName, range = '') => {
  try {
    // スプレッドシートIDを抽出
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

    if (!spreadsheetId) {
      throw new Error('無効なスプレッドシートURLです')
    }

    // まずgviz APIでシート情報を取得
    const apiUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`

    const response = await fetch(apiUrl)
    const text = await response.text()

    // Google APIのレスポンスから JSONを抽出
    const jsonString = text.substring(47, text.length - 2)
    const data = JSON.parse(jsonString)

    // データを整形して返す
    const parsedData = parseGoogleSheetsData(data)

    console.log(`fetchSheetData - ${sheetName}: got ${parsedData.length} rows from gviz API`)

    // もし6行以下しか取れていない場合は、CSVエクスポートを試みる
    if (parsedData.length <= 7) {
      console.warn(`Only ${parsedData.length} rows from gviz, trying CSV export...`)

      try {
        const csvUrlWithSheet = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
        const csvResponse = await fetch(csvUrlWithSheet)
        const csvText = await csvResponse.text()
        const csvData = parseCSV(csvText)
        console.log(`CSV export (with sheet name): got ${csvData.length} rows`)
        if (csvData.length > 7) {
          return csvData
        }
      } catch (csvError) {
        console.warn('CSV export with sheet name failed:', csvError)
      }

      try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`
        const csvResponse = await fetch(csvUrl)
        const csvText = await csvResponse.text()
        const csvData = parseCSV(csvText)
        console.log(`CSV export (gid=0): got ${csvData.length} rows`)
        if (csvData.length > parsedData.length) {
          return csvData
        }
      } catch (csvError) {
        console.warn('CSV export with gid=0 failed:', csvError)
      }

      console.warn('All CSV export attempts failed, using gviz data')
      return parsedData
    }

    return parsedData
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    throw error
  }
}

// スプレッドシートIDを抽出
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// Google Sheetsのデータを解析
const parseGoogleSheetsData = (data) => {
  if (!data.table || !data.table.rows) {
    return []
  }

  const rows = data.table.rows
  const parsedData = []

  rows.forEach(row => {
    if (row.c) {
      const rowData = row.c.map(cell => {
        if (!cell) return null
        return cell.v !== null ? cell.v : null
      })
      parsedData.push(rowData)
    }
  })

  return parsedData
}

// CSVテキストをパースする関数
const parseCSV = (csvText) => {
  const lines = csvText.split('\n')
  const result = []

  lines.forEach(line => {
    if (line.trim()) {
      const row = []
      let currentCell = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          row.push(currentCell.trim())
          currentCell = ''
        } else {
          currentCell += char
        }
      }
      row.push(currentCell.trim())
      result.push(row)
    }
  })

  return result
}

// テキスト評価を数値に変換
export const convertEvaluationToNumber = (text) => {
  if (!text) return 0

  const textStr = String(text).trim()

  if (textStr === '出来ていた') return 1.0
  if (textStr === 'やや出来ていた') return 0.7
  if (textStr === 'やや出来ていない') return 0.3
  if (textStr === '出来なかった') return 0.0
  if (textStr === '対象外') return 0.0
  if (textStr === '管理部門対象外') return 0.0

  return 0
}

// データを構造化されたオブジェクトに変換
export const convertToStructuredData = (rawData, type) => {
  if (!rawData || rawData.length === 0) {
    return []
  }

  console.log(`convertToStructuredData - type: ${type}, rawData length: ${rawData.length}`)

  if (type === 'sales') {
    const headers = rawData[0]
    return rawData.slice(1).map(row => ({
      name: row[0],
      department: row[1],
      year: row[2],
      sales: parseFloat(row[3]) || 0,
      profit: parseFloat(row[4]) || 0
    }))
  } else if (type === 'evaluationMaster') {
    if (rawData.length < 2) return []

    const headers = rawData[0].map(h => String(h).trim())

    const findIndex = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)))

    const idx = {
      categoryNo: findIndex(['大項目番号', 'No', 'CategoryNo']),
      major: findIndex(['大項目', '大カテゴリ', 'Major']),
      minor: findIndex(['中項目', '中カテゴリ', 'Minor']),
      criteria: findIndex(['審査内容', '評価基準', '内容', 'Criteria']),
      questionNo: findIndex(['設問番号', '質問番号', 'QuestionNo', 'No.'])
    }

    const headerRowIndex = rawData.findIndex(row =>
      row.some(cell => String(cell).includes('審査内容') || String(cell).includes('項目'))
    )

    if (headerRowIndex !== -1) {
      const headerRow = rawData[headerRowIndex]
      const colMap = {
        categoryNo: 0,
        majorCategory: 1,
        majorDesc: null,
        minorCategory: 3,
        criteria: 4
      }

      headerRow.forEach((cell, idx) => {
        const text = String(cell).trim()
        if (text === 'No.' || text === 'カテゴリー') colMap.categoryNo = idx
        if (text === '項目' || text === '大カテゴリ') colMap.majorCategory = idx
        if (text.includes('説明') || text.includes('補足')) colMap.majorDesc = idx
        if (text === '審査内容') colMap.criteria = idx
        if (idx > colMap.majorCategory && idx < colMap.criteria && String(rawData[headerRowIndex + 2]?.[idx] || '').length > 0) {
          colMap.minorCategory = idx
        }
      })

      console.log('Detected User Format:', colMap)
    }

    return rawData.slice(1).filter(row => row.length >= 5).map(row => ({
      categoryNo: row[idx.categoryNo],
      majorCategory: row[idx.major],
      minorCategory: row[idx.minor],
      criteria: row[idx.criteria],
      questionNo: parseInt(row[idx.questionNo]) || 0
    }))
  } else if (type === 'selfEvaluation' || type === 'managerEvaluation') {
    return rawData.slice(1).map(row => ({
      timestamp: row[0],
      name: row[1],
      department: row[2],
      answers: row.slice(3)
    }))
  } else if (type === 'totalScore') {
    return rawData.slice(1).map(row => ({
      name: row[1],
      totalScore: parseFloat(row[169]) || 0
    }))
  }

  return rawData
}

// 4つのシートをマージして評価データを生成
export const mergeEvaluationData = (masterData, selfData, managerData, scoreData) => {
  const employees = {}

  selfData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: item.answers,
        managerAnswers: [],
        totalScore: 0
      }
    } else {
      employees[item.name].selfAnswers = item.answers
    }
  })

  managerData.forEach(item => {
    if (!employees[item.name]) {
      employees[item.name] = {
        name: item.name,
        department: item.department,
        selfAnswers: [],
        managerAnswers: item.answers,
        totalScore: 0
      }
    } else {
      employees[item.name].managerAnswers = item.answers
    }
  })

  scoreData.forEach(item => {
    if (employees[item.name]) {
      employees[item.name].totalScore = item.totalScore
    }
  })

  return employees
}

// ============================================
// 売上ランキングデータの変換（シンプル版）
// ============================================

// 数値文字列をパースするヘルパー関数
const parseNumericString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  const cleanStr = str.toString().replace(/[¥￥,%％\s　]/g, '')
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : num
}

// 順位文字列から数値を抽出（「1位」→ 1）
const parseRankString = (str) => {
  if (typeof str === 'number') return str
  if (!str) return 0
  const match = String(str).match(/(\d+)/)
  return match ? parseInt(match[1]) : 0
}

// セルが有効な氏名かどうかを判定（より柔軟に）
const isValidName = (cell) => {
  if (!cell) return false
  const str = String(cell).trim()
  if (str === '') return false
  // 数値のみ、記号のみは除外
  if (/^[\d,.\s¥￥%％位]+$/.test(str)) return false
  // ヘッダー系の文字列は除外
  const excludeWords = [
    '売上ランキング', '粗利ランキング', '氏名', '売上額', '売上高',
    '全体内%', '部内%', '部内％', '全体内％', '粗利額', '順位',
    '東京', '大阪', '名古屋', '畠山部', '全体', '合計',
    'ランキング', '支払高', '粗利益', '粗利益率'
  ]
  if (excludeWords.includes(str)) return false
  // 2文字以上で、日本語を含む
  return str.length >= 2 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(str)
}

// 売上ランキングデータの変換（メイン関数）- シンプルなアプローチ
export const convertSalesRankingData = (rawData, sheetName) => {
  console.log(`convertSalesRankingData called for sheet: ${sheetName}`)
  console.log(`[Debug] ${sheetName}: Total rows received: ${rawData?.length || 0}`)

  if (!rawData || rawData.length < 2) {
    console.log(`Returning empty array - insufficient data`)
    return []
  }

  // デバッグ: 最初の20行を出力
  console.log(`[Debug] ${sheetName}: First 20 rows sample:`)
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i]
    if (row) {
      const preview = row.slice(0, 6).map(c => String(c || '').substring(0, 15)).join(' | ')
      console.log(`  Row ${i}: ${preview}`)
    }
  }

  const results = []
  const seen = new Set()

  // 全行をスキャンして、「X位」+ 有効な名前 のパターンを探す
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.length < 3) continue

    // 各列をチェックして、「X位」のパターンを探す
    for (let j = 0; j < row.length - 2; j++) {
      const cell = String(row[j] || '').trim()
      
      // 「X位」パターンにマッチするか
      if (/^\d+位$/.test(cell) || /^\d+$/.test(cell)) {
        const rank = parseRankString(cell)
        if (rank === 0 || rank > 100) continue // 無効な順位はスキップ
        
        // 次の列が有効な名前か
        const nameCell = row[j + 1]
        if (isValidName(nameCell)) {
          const name = String(nameCell).trim()
          
          // 重複チェック
          if (seen.has(name)) continue
          
          // 売上額を探す（名前の次の列）
          const salesCell = row[j + 2]
          const sales = parseNumericString(salesCell)
          
          // シェアを探す（売上の次の列）
          const shareCell = row[j + 3]
          const share = parseNumericString(shareCell)
          
          // 売上が0より大きい場合のみ追加
          if (sales > 0) {
            seen.add(name)
            results.push({
              rank: rank,
              name: name,
              sales: sales,
              share: share,
              profit: 0,
              achievement: 0,
              yoy: 0,
              department: sheetName
            })
            console.log(`[Debug] ${sheetName}: Found person - Rank: ${rank}, Name: ${name}, Sales: ${sales}`)
          }
        }
      }
    }
  }

  // 「全体」シートの場合、部署ランキング（東京、大阪など）を除外
  let finalResults = results
  if (sheetName === '全体') {
    // 売上額が最も大きいものを除外（通常は部署合計）
    // または、同じ順位が複数ある場合は個人データのみを残す
    const rankCounts = {}
    results.forEach(r => {
      rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1
    })
    
    // 順位が重複している場合、売上が小さい方（個人）を残す
    const duplicateRanks = Object.entries(rankCounts)
      .filter(([rank, count]) => count > 1)
      .map(([rank]) => parseInt(rank))
    
    if (duplicateRanks.length > 0) {
      console.log(`[Debug] ${sheetName}: Duplicate ranks found: ${duplicateRanks}`)
      // 重複している順位のデータをグループ化
      const grouped = {}
      results.forEach(r => {
        if (!grouped[r.rank]) grouped[r.rank] = []
        grouped[r.rank].push(r)
      })
      
      finalResults = []
      Object.values(grouped).forEach(group => {
        if (group.length === 1) {
          finalResults.push(group[0])
        } else {
          // 売上が最も小さいもの（個人データ）を選択
          const minSales = Math.min(...group.map(g => g.sales))
          const individual = group.find(g => g.sales === minSales)
          if (individual) {
            finalResults.push(individual)
          }
        }
      })
    }
  }

  // 順位でソート
  finalResults.sort((a, b) => a.rank - b.rank)

  console.log(`convertSalesRankingData result for ${sheetName}: ${finalResults.length} records`)
  if (finalResults.length > 0) {
    console.log(`[Debug] ${sheetName}: First record:`, finalResults[0])
    console.log(`[Debug] ${sheetName}: Last record:`, finalResults[finalResults.length - 1])
  }

  return finalResults
}

// 複数シートから売上データを読み込む
export const fetchAllSalesSheets = async (spreadsheetUrl) => {
  const sheetNames = ['全体', '東京', '大阪', '名古屋', '畠山部']

  try {
    const results = await Promise.all(
      sheetNames.map(async (sheetName) => {
        try {
          const rawData = await fetchSheetData(spreadsheetUrl, sheetName)
          const convertedData = convertSalesRankingData(rawData, sheetName)
          return { sheetName, data: convertedData, success: true }
        } catch (error) {
          console.error(`Error fetching ${sheetName}:`, error)
          return { sheetName, data: [], success: false, error: error.message }
        }
      })
    )

    const salesData = {
      overall: [],
      tokyo: [],
      osaka: [],
      nagoya: [],
      hatakeyama: [],
      errors: []
    }

    results.forEach(result => {
      if (result.success) {
        switch (result.sheetName) {
          case '全体':
            salesData.overall = result.data
            break
          case '東京':
            salesData.tokyo = result.data
            break
          case '大阪':
            salesData.osaka = result.data
            break
          case '名古屋':
            salesData.nagoya = result.data
            break
          case '畠山部':
            salesData.hatakeyama = result.data
            break
        }
      } else {
        salesData.errors.push({
          sheet: result.sheetName,
          error: result.error
        })
      }
    })

    return salesData
  } catch (error) {
    console.error('Error fetching all sales sheets:', error)
    throw error
  }
}
