import {useEffect, useRef} from 'react'

async function fetchPrice(ticker){
    const response = await fetch(`http://localhost:3001/api/quote?symbol=${encodeURIComponent(ticker)}`)
    const data = await response.json()
    return data
}

export function useRefreshPrices(assets, setAssets, intervalMs = 30000){
    console.log('useRefreshPrices called', assets)
    const assetsRef = useRef(assets)
    
    useEffect(() => {
        assetsRef.current = assets
    }, [assets])
    
    useEffect(() => {
        const interval = setInterval(async () => {
            console.log('interval fired, assets:', assetsRef.current.length)
            assetsRef.current.forEach(async (asset) => {
                console.log('fetching:', asset.name)
                const data = await fetchPrice(asset.name)
                console.log('Refreshed:', asset.name, 'price:',data.c)
                if(data && data.c){
                    setAssets(prev => prev.map(a => 
                        a.name === asset.name? {...a, price:data.c, change:data.dp}: a
                    ))
                }
            })
        }, intervalMs)
        return () => clearInterval(interval)
    }, [])
}