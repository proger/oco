let typingTimer;
let originalResults;

document.getElementById('searchbox').addEventListener('keyup', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(runQuery, 500);
});

window.addEventListener('load', (event) => {
    originalResults = document.getElementById('results').cloneNode(true);

    document.getElementById('file').addEventListener('change', function(event) {
        const input = event.target;
        const root = document.querySelector(":root");
        const name = input.files[0].name ?? "Choose file to upload...";
        root.style.setProperty("--selected-file", JSON.stringify(name));
    });
});

function runQuery() {
    let xs = originalResults.querySelectorAll('p');
    let query = new RegExp(document.getElementById('searchbox').value);
    let result = '';
    let count = 0;
    for (const x of xs) {
        if (x.innerText.match(query)) {
            console.log(x.innerText)
            result += x.outerHTML;
            count += 1;
        }
    }
    document.getElementById('results').innerHTML = result;
    document.getElementById('counter').innerText = `${count} name regex matches among ${originalResults.children.length} files`;
}