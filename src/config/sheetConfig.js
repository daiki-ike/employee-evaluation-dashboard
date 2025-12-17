// Google Sheets Config
// 本番運用用のURLとシート名定義

export const SHEET_CONFIG = {
    // 売上ランキング用スプレッドシート
    SALES: {
        URL: 'https://docs.google.com/spreadsheets/d/1EKA17UBJExArD8miQ9aIiEY14wcOdHArZdtHVTIv96k/edit?usp=sharing',
        SHEET_NAMES: ['全体', '東京', '大阪', '名古屋', '企画開発']
    },

    // 評価データ用スプレッドシート
    // ※全て同じスプレッドシートIDを使用（シート別）
    EVALUATION: {
        URL: 'https://docs.google.com/spreadsheets/d/1OB2PpMwig1QGImOMf8m46LyOP8g_WaAFrgXLw1fa62g/edit?usp=sharing',
        SHEETS: {
            MASTER: {
                NAME: 'シート1', // 評価マスター
                TYPE: 'evaluationMaster'
            },
            SELF_EVAL: {
                NAME: 'フォームの回答_自己', // 旧: フォームの回答 1
                TYPE: 'selfEvaluation'
            },
            MANAGER_EVAL: {
                NAME: 'フォームの回答_部長',
                TYPE: 'managerEvaluation'
            },
            TOTAL_SCORE: {
                NAME: '計算_部長',
                TYPE: 'totalScore'
            }
        }
    }
}
