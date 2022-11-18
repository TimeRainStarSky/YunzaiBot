import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import lodash from 'lodash'
import fs from 'fs'


if (!fs.existsSync('./data/payLog/')) {
    fs.mkdirSync('./data/payLog/')
}

export class PayData {
    constructor(authKey = '') {
        this.#authkey = encodeURIComponent(authKey)
    }
    #genShinId = ''
    #oringinData = []
    #authkey = ''

    /**获取原始支付数据 */
    async getOringinalData(id = '') {
        let res = await fetch(this.getUrl() + id, this.headers)
        let ret = await res.json()
        // 加一个authkey不同情况
        if (ret?.retcode === -101 || ret?.retcode === -100) {
            return ret.retcode === -101 ? { errorMsg: '您的链接过期，请重新获取' } : { errorMsg: '链接不正确，请重新获取' }
        }
        let list = ret.data.list
        if (list.length === 20) {
            this.#oringinData.push(...list)
            await this.getOringinalData(list[19].id)
            return true
        } else {
            this.#oringinData.push(...list)
            return true
        }
    }

    /**获取大月卡数据 */
    async getPrimogemLog(id = '') {
        let res = await fetch(this.getUrl('getPrimogemLog') + id, this.headers)
        let ret = await res.json()
        let list = ret.data.list
        if (list.length === 20) {
            list.forEach(v => {
                if (v.add_num === '680') this.#oringinData.push(v)
            })
            await this.getPrimogemLog(list[19].id)
            return true
        } else {
            list.forEach(v => {
                if (v.add_num === '680') this.#oringinData.push(v)
            })
            return true
        }
    }

    /**对原始数据进行筛选，组合 */
    async filtrateData() {
        // 获取数据
        let isSucceed = await this.getOringinalData()
        // 判断数据是否获取成功
        console.log(isSucceed);
        if (isSucceed?.errorMsg) return isSucceed
        await this.getPrimogemLog()
        // 获取uid，并判断零氪党的情况
        if (this.#oringinData[0]?.uid) {
            this.#genShinId = this.#oringinData[0].uid
        } else {
            return { errorMsg: '未获取到您的任何充值数据' }
        }
        // 将原始数据按id排序
        this.#oringinData = this.#oringinData.sort((a, b) => {
            let val1 = Number(a.id)
            let val2 = Number(b.id)
            if (val2 > val1) {
                return -1
            } else {
                return 1
            }
        })
        // 
        const price = [680, 300, 8080, 3880, 2240, 1090, 330, 60]
        const doublePrice = [0, 0, 12960, 6560, 3960, 1960, 600, 120]
        let month = 0
        let sum = 0
        let i = -1
        let listIndex = 0
        let list = []
        for (let index = 0; index < this.#oringinData.length; index++) {
            // 如果小于零则返回
            let num = Number(this.#oringinData[index].add_num)
            if (num < 0) continue
            // 获取月份
            let thisMonth = ++moment(this.#oringinData[index].time).toArray()[1]
            if (thisMonth !== month) {
                i++
                month = thisMonth
                list[listIndex++] = {
                    month: thisMonth + '月',
                    payNum: [0, 0, 0, 0, 0, 0, 0, 0]
                }
            } else if (!i) {
                list[i] = {
                    month: thisMonth + '月',
                    payNum: [0, 0, 0, 0, 0, 0, 0, 0]
                }
            }
            for (let index = 0; index < 8; index++) {
                if (num === price[index] || num === doublePrice[index]) {
                    list[i].payNum[index]++
                    if (num !== 680) sum += num
                    break
                }
            }
        }
        return {
            uid: this.#genShinId,
            crystal: sum,
            monthData: list
        }
    }

    headers = {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site"
        },
        "referrer": "https://webstatic.mihoyo.com/",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "method": "GET",
        "mode": "cors",
        "credentials": "include"
    }

    // 两个api //原石 getPrimogemLog //结晶 getCrystalLog
    getUrl(api = 'getCrystalLog') {
        let type = api === 'getCrystalLog' ? 3 : 1
        return `https://hk4e-api.mihoyo.com/ysulog/api/${api}?selfquery_type=${type}&lang=zh-cn&sign_type=2&auth_appid=csc&authkey_ver=1&authkey=${this.#authkey}&game_biz=hk4e_cn&app_client=bbs&type=${type}&size=20&end_id=`
    }

}


export class HtmlData {
    /**
     * @param data 数据
     * @param data.monthData 月份数据
     * @param data.crystal 总结晶数
     */
    constructor(data = {}) {
        this.monthData = data.monthData
        this.crystal = data.crystal
        this.uid = data.uid
    }

    crystal = 0
    uid = ''
    monthData = []

    // 价格
    price = [68, 30, 648, 328, 198, 98, 30, 6]

    /**柱形图数据 */
    getBarData() {
        return this.monthData.map(v => {
            return {
                type: v.month,
                sales: v.payNum.reduce((sum, val, index) => sum + val * this.price[index], 0)
            }
        })
    }

    /**顶部数据 */
    getTopData(crystal = 0) {
        const maxMonth = this.maxcConsumption()
        const sum = this.sumConsumption()
        return [
            {
                title: '总消费',
                value: '￥' + this.getBarData().reduce((sum, val) => sum + val.sales, 0)
            },
            {
                title: '总结晶',
                value: this.crystal
            },
            {
                title: '消费最多',
                value: maxMonth.type
            },
            {
                title: maxMonth.type + '消费',
                value: '￥' + maxMonth.sales
            },
            ...sum,
        ]
    }
    /**饼图数据 */
    getPieData() {
        const data = this.sumConsumption()
        let pieData = []
        data.forEach((val, index) => {
            let value = val.value * this.price[index]
            if (value) {
                pieData.push({
                    value,
                    name: val.title
                })
            }
        })
        return pieData
    }

    /**消费最多月 */
    maxcConsumption() {
        return this.getBarData().sort((a, b) => {
            if (a.sales < b.sales) {
                return 1
            } else {
                return -1
            }
        })[0]
    }

    /**每种消费的总数 */
    sumConsumption() {
        let sum = {
            '小月卡': 0,
            '大月卡': 0,
            '648': 0,
            '328': 0,
            '198': 0,
            '98': 0,
            '30': 0,
            '6': 0
        }
        // 循环sum,按照月份统计各个充值的类别总数
        let k = Object.keys(sum).reverse()
        this.monthData.forEach(val => {
            val.payNum.forEach((v, i) => {
                sum[k[i]] += v
            })
        })
        // 返回title,value对象'648':123456
        let value = Object.values(sum).reverse()
        return k.map((val, index) => {
            return {
                title: val,
                value: value[index]
            }
        })
    }
}

export async function renderImg(data) {
    const iocn = ['甘雨', '柯莱', '可莉', '妮露', '赛诺', '提纳里', '夜兰']
    const htmlData = new HtmlData(data)
    /**路径,html形式 */
    const _path = process.cwd().replace(/\\/g, '/')
    /**res路径 */
    const resources = _path + '/plugins/genshin/resources/'
    /**html路径 */
    const tplFile = './plugins/genshin/resources/html/payLog/payLog.html'
    /**原神图标 */
    const pluResPath = _path + '/plugins/genshin/resources/img/other/原神.png'
    /**字体文件 */
    const fontPath = _path + '/resources/font/tttgbnumber.ttf'
    /**字体样式 */
    const headStyle = `<style> .head_box { background: url(${_path}/plugins/genshin/resources/img/namecard/${iocn[lodash.random(0, 6)]}.png) #fff; background-position-x: 42px; background-repeat: no-repeat; background-size: auto 101%; }</style>`
    const imgDatas = {
        saveId: 'payLog',
        imgType: 'jpeg',
        topData: htmlData.getTopData(),
        barData: JSON.stringify(htmlData.getBarData()),
        pieData: JSON.stringify(htmlData.getPieData()),
        uid: htmlData.uid,
        resources,
        tplFile,
        pluResPath,
        fontPath,
        headStyle
    }
    let img = await puppeteer.screenshot('payLog', imgDatas)
    return img
}
