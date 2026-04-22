function AssetCard({name, price, change, onRemove, onClick}){
    return (
        <div 
            className="bg-gray-900 p-4 rounded-xl cursor-pointer hover:bg-gray-800 transition-colors"
            onClick = {onClick}
        >
        <p className="text-gray-400 text-sm">{name}</p>
        <p className="text-2xl font-bold">${parseFloat(price).toFixed(2)}</p>
        <p className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {change >= 0 ? '+' : ''}{parseFloat(change).toFixed(2)}%
        </p>
        <button 
            onClick = {(e) => {e.stopPropagation(); onRemove()}}
            className = "bg-purple-600 px-4 py-2 rounded-lg hover:bg-purple-700 mt-2"
        >
            Remove
        </button>
    </div>)
}
export default AssetCard