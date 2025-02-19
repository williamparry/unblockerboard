var NODE_W = 120,
    NODE_H = 40,
    X_GAP = 200,
    Y_GAP = 50;
const LOCK_ICON = "🔐";
const UNLOCK_ICON = "🔓";
let activeInput = null;
let inlineEditNode = -1;
let selectedForAdd = -1;
let encryptedByOwner = false;
let activePassphrase = null;
let boardIsEncrypted = false;

var defaultBoard = {
    n: [["final", ""]],
    e: []
};
var board = null;

function encodeBoard(b) {
    return LZString.compressToEncodedURIComponent(JSON.stringify(b));
}

function decodeBoard(str) {
    return JSON.parse(LZString.decompressFromEncodedURIComponent(str));
}

function encryptData(data, passphrase) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), passphrase).toString();
}

function decryptData(ciphertext, passphrase) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedData);
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
}

function loadBoardFromHash() {
    let h = window.location.hash.slice(1);

    const encryptedFlag = "__=";
    const encryptedIndex = h.indexOf(encryptedFlag);
    boardIsEncrypted = encryptedIndex !== -1;

    if (boardIsEncrypted) {
        const ciphertext = h.substring(encryptedIndex + encryptedFlag.length);
        let storedPassphrase = localStorage.getItem("passphrase");
        let decryptedBoard = decryptData(ciphertext, storedPassphrase);

        if (storedPassphrase && decryptedBoard) {
            encryptedByOwner = true;
            activePassphrase = storedPassphrase;
            return decryptedBoard
        }

        storedPassphrase = sessionStorage.getItem("passphrase")
        decryptedBoard = decryptData(ciphertext, storedPassphrase);

        if (storedPassphrase && decryptedBoard) {
            activePassphrase = storedPassphrase;
            return decryptedBoard;
        }

        const askedPassphrase = prompt("Enter passphrase to decrypt the board:");
        decryptedBoard = decryptData(ciphertext, askedPassphrase);
        if (!askedPassphrase || !decryptedBoard) {
            throw new Error("Decryption failed");
        } else {
            sessionStorage.setItem("passphrase", askedPassphrase);
            activePassphrase = askedPassphrase;
            return decryptedBoard;
        }

    } else {
        if (h) {
            const decodedBoard = decodeBoard(h);

            if (!decodedBoard) {
                throw new Error("Decoding failed")
            } else {
                return decodedBoard;
            }
        }

        return defaultBoard;
    }
}

function saveBoardToHash(b) {
    let encodedData;
    if (activePassphrase) {
        encodedData = "__=" + encryptData(b, activePassphrase);
    } else {
        encodedData = encodeBoard(b);
    }
    window.history.replaceState(null, "", "#" + encodedData);
}

function generatePassphrase() {
    const passphrase = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    return passphrase;
}

function getBlockers(b, nodeIdx) {
    var arr = [];
    for (var i = 0; i < b.e.length; i++) {
        var e = b.e[i];
        if (e[1] === nodeIdx) {
            arr.push(e[0]);
        }
    }
    return arr;
}

function getNodeWidth(nodeIdx) {
    var text = board.n[nodeIdx][1];
    var calc = text.length * 10 + 60;
    return Math.max(120, calc);
}

function measureSubtree(nodeIdx) {
    if (nodeIdx === -1) {
        return {
            nodeIdx: -1,
            width: 120,
            height: NODE_H,
            children: []
        };
    }
    var width = getNodeWidth(nodeIdx);
    var deps = getBlockers(board, nodeIdx);
    var childSubs = deps.map(measureSubtree);
    if (nodeIdx === selectedForAdd) {
        childSubs.push({
            nodeIdx: -1,
            width: 120,
            height: NODE_H,
            children: []
        });
    }
    if (childSubs.length === 0) {
        return {
            nodeIdx: nodeIdx,
            width: width,
            height: NODE_H,
            children: []
        };
    } else {
        var totalHeight = 0;
        childSubs.forEach(function (st) {
            totalHeight += st.height;
        });
        totalHeight += (childSubs.length - 1) * Y_GAP;
        return {
            nodeIdx: nodeIdx,
            width: width,
            height: Math.max(NODE_H, totalHeight),
            children: childSubs
        };
    }
}
var layoutItems = [];
var layoutEdges = [];

function layoutSubtree(st, parentIdx, x, topY) {
    var nodeIdx = st.nodeIdx,
        w = st.width,
        h = st.height,
        midY = topY + h / 2;
    if (nodeIdx >= 0) {
        layoutItems.push({
            type: "node",
            nodeIdx: nodeIdx,
            x: x,
            y: midY,
            width: w
        });
        if (parentIdx !== null && parentIdx >= 0) {
            layoutEdges.push({
                x1: x + w / 2,
                y1: midY,
                x2: 0,
                y2: 0,
                parentNodeIdx: parentIdx,
                dashed: false
            });
        }
    } else {
        layoutItems.push({
            type: "placeholder",
            parent: parentIdx,
            x: x,
            y: midY,
            width: 120
        });
        if (parentIdx !== null && parentIdx >= 0) {
            layoutEdges.push({
                x1: x + 120 / 2,
                y1: midY,
                x2: 0,
                y2: 0,
                parentNodeIdx: parentIdx,
                dashed: true
            });
        }
    }
    var usedY = topY;
    st.children.forEach(function (childSt) {
        layoutSubtree(childSt, (nodeIdx >= 0 ? nodeIdx : parentIdx), x - X_GAP, usedY);
        usedY += childSt.height + Y_GAP;
    });
}

function fixEdges() {
    var posMap = {};
    layoutItems.forEach(function (it) {
        if (it.type === "node" && it.nodeIdx >= 0) {
            posMap[it.nodeIdx] = {
                x: it.x,
                y: it.y,
                width: it.width
            };
        }
    });
    layoutEdges.forEach(function (ed) {
        var ppos = posMap[ed.parentNodeIdx];
        if (ppos) {
            ed.x2 = ppos.x - ppos.width / 2;
            ed.y2 = ppos.y;
        }
    });
}

function computeLayout() {
    var container = document.getElementById("graphContainer");
    var w = container.offsetWidth,
        h = container.offsetHeight;
    var rootX = container.offsetWidth - getNodeWidth(0);
    var rootSt = measureSubtree(0);
    layoutItems = [];
    layoutEdges = [];
    var topY = Math.max(0, (h - rootSt.height) / 2);
    layoutSubtree(rootSt, null, rootX, topY);
    fixEdges();
    return {
        layoutItems,
        layoutEdges
    }; // Return layout data
}

function countDirectChildren(nodeIdx) {
    return getBlockers(board, nodeIdx).length;
}

function totalCharCount() {
    return window.location.href.length;
}

function getCountIconSize(count) {
    return 16 + count * 2;
}

function createBezier(x1, y1, x2, y2) {
    var mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function removeNode(nodeIdx) {
    // Prevent removal of the root node (index 0)
    if (nodeIdx === 0) return;
    // Remove any edge where this node is the child
    board.e = board.e.filter(edge => edge[0] !== nodeIdx);
    // Remove the node from the nodes array.
    board.n.splice(nodeIdx, 1);
    // After removal, update all edge indices that are greater than nodeIdx.
    board.e = board.e.map(edge => {
        let child = edge[0],
            parent = edge[1];
        if (child > nodeIdx) child--;
        if (parent > nodeIdx) parent--;
        return [child, parent];
    });
}

// --------------------------------------------------
// Rendering the board
// --------------------------------------------------
function renderBoard() {

    // Add "Complete!" node if it doesn't exist
    if (board.n.length > 0 && board.n[0][1] !== "Complete!") {
        board.n[0][1] = "Complete!"; // Set the "Complete!" text
    }

    const {
        layoutItems,
        layoutEdges
    } = computeLayout();

    var margin = 50;
    var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    layoutItems.forEach(function (it) {
        if (it.x < minX) minX = it.x;
        if (it.y < minY) minY = it.y;
        if (it.x > maxX) maxX = it.x;
        if (it.y > maxY) maxY = it.y;
    });
    minX -= margin / 2;
    minY -= margin / 2;
    maxX += margin / 2;
    maxY += margin / 2;
    var contentWidth = maxX - minX,
        contentHeight = maxY - minY;

    var boardContent = document.getElementById("boardContent");
    if (!boardContent) {
        boardContent = document.createElement("div");
        boardContent.id = "boardContent";
        boardContent.style.position = "absolute";
        document.getElementById("graphContainer").appendChild(boardContent);
    }
    boardContent.style.width = contentWidth + "px";
    boardContent.style.height = contentHeight + "px";

    var node0 = layoutItems.find(function (it) {
        return it.type === "node" && it.nodeIdx === 0;
    });
    var node0ShiftedX = node0 ? (node0.x - minX) : 0;
    var node0ShiftedY = node0 ? (node0.y - minY) : 0;
    var containerEl = document.getElementById("graphContainer");
    var offsetX = containerEl.offsetWidth - getNodeWidth(0) - node0ShiftedX;
    var offsetY = containerEl.offsetHeight / 2 - NODE_H / 2 - node0ShiftedY;
    boardContent.style.left = offsetX + "px";
    boardContent.style.top = offsetY + "px";

    boardContent.innerHTML = "";

    var charCountIndicator = document.getElementById("charCountIndicator");
    var charCountText = document.getElementById("charCountText");
    charCountText.textContent = totalCharCount() + " / 2048";

    layoutItems.forEach(function (it) {
        var left = (it.x - minX) - (it.width / 2);
        var top = (it.y - minY) - (NODE_H / 2);
        if (it.type === "node") {
            var el = document.createElement("div");
            el.className = "node-box";
            el.dataset.nodeIdx = it.nodeIdx;
            el.style.left = left + "px";
            el.style.top = top + "px";
            el.style.width = it.width + "px";

            var labelSpan = document.createElement("span");
            labelSpan.className = "node-label";
            labelSpan.textContent = board.n[it.nodeIdx][1];
            el.appendChild(labelSpan);

            var editIcon = document.createElement("div");
            editIcon.className = "edit-icon";
            editIcon.innerHTML = "✎";
            el.appendChild(editIcon);

            var directCount = countDirectChildren(it.nodeIdx);
            var circleSize = getCountIconSize(directCount);
            if (directCount > 0) {
                var countIcon = document.createElement("div");
                countIcon.className = "count-icon";
                countIcon.style.width = circleSize + "px";
                countIcon.style.height = circleSize + "px";
                countIcon.style.lineHeight = circleSize + "px";
                countIcon.textContent = directCount;
                el.appendChild(countIcon);
            } else {
                // For leaf nodes (without blockers), show a checkbox that will remove the node when clicked.
                var checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.className = "check-icon";
                el.appendChild(checkbox);
            }

            // Click Handler: Clear selectedForAdd if clicking a different node
            el.addEventListener("click", function (e) {
                e.stopPropagation();
                if (inlineEditNode === -1) {
                    selectedForAdd = (selectedForAdd === it.nodeIdx) ? -1 : it.nodeIdx; // Toggle selection
                    renderBoard();
                }
            });
            boardContent.appendChild(el);
        } else if (it.type === "placeholder") {
            var ph = document.createElement("div");
            ph.className = "placeholder-box";
            ph.style.left = left + "px";
            ph.style.top = top + "px";
            ph.textContent = "Add Blocker";
            ph.addEventListener("click", function (e) {
                e.stopPropagation();
                startPlaceholderInlineEditing(ph, it.parent);
            });
            boardContent.appendChild(ph);
            // Auto-start (if applicable)
            if (it.parent === selectedForAdd && inlineEditNode === -1) {
                startPlaceholderInlineEditing(ph, it.parent);
            }
        }
    });

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("arrow-layer");
    svg.setAttribute("width", contentWidth);
    svg.setAttribute("height", contentHeight);
    boardContent.appendChild(svg);
    layoutEdges.forEach(function (ed) {
        var x1 = ed.x1 - minX,
            y1 = ed.y1 - minY;
        var x2 = ed.x2 - minX,
            y2 = ed.y2 - minY;
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", createBezier(x1, y1, x2, y2));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-width", "2");
        if (ed.dashed) {
            path.setAttribute("stroke", "#666");
            path.setAttribute("stroke-dasharray", "4,4");
        } else {
            path.setAttribute("stroke", "#000");
        }
        svg.appendChild(path);
    });

    var node0El = boardContent.querySelector(".node-box[data-node-idx='0']");
    if (node0El) {
        containerEl.scrollLeft = boardContent.offsetWidth - containerEl.offsetWidth;
        var rect = node0El.getBoundingClientRect();
        containerEl.scrollTop = Math.max(0, rect.top - containerEl.offsetHeight / 2 + NODE_H / 2);
    }
}

function startNodeInlineEditing(nodeIdx) {

    var container = document.getElementById("boardContent");
    var el = container.querySelector(".node-box[data-node-idx='" + nodeIdx + "']");
    if (!el) return;

    inlineEditNode = nodeIdx;
    var labelSpan = el.querySelector(".node-label");
    if (!labelSpan) return;
    var oldText = labelSpan.textContent;
    var input = document.createElement("input");
    input.type = "text";
    input.value = oldText;
    input.className = "inline-editor";
    var allowed = 2000 - (totalCharCount() - oldText.length);
    input.maxLength = allowed;
    input.style.width = el.clientWidth + "px";
    activeInput = input;
    el.replaceChild(input, labelSpan);
    setTimeout(function () {
        input.focus();
        input.select();
    }, 0);

    // Handle changes on Enter key press *synchronously*
    input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            var newText = input.value.trim();
            if (!newText) newText = oldText; // Keep old text if empty
            board.n[nodeIdx][1] = newText;
            var newLabel = document.createElement("span");
            newLabel.className = "node-label";
            newLabel.textContent = newText;
            el.replaceChild(newLabel, input);
            inlineEditNode = -1;
            selectedForAdd = -1;
            activeInput = null;
            saveBoardToHash(board);
            renderBoard();
        }
    });
}

function startPlaceholderInlineEditing(ph, parentIdx) {
    ph.innerHTML = "";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add Blocker";
    input.className = "inline-editor";
    input.maxLength = 2000 - totalCharCount();
    ph.appendChild(input);
    activeInput = input;
    setTimeout(function () {
        input.focus();
        input.select();
    }, 0);

    // Handle changes on Enter key press *synchronously*
    input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            var text = input.value.trim();
            activeInput = null;
            if (text) {
                var newIdx = board.n.length;
                var newId = "node-" + Date.now();
                board.n.push([newId, text]);
                board.e.push([newIdx, parentIdx]);
                selectedForAdd = parentIdx; // Keep "Add Blocker"
                saveBoardToHash(board);
            } else {
                //clear
                selectedForAdd = -1;
            }
            renderBoard(); // Re-render immediately
        }
    });
}

function init() {

    newBoard.addEventListener("click", (e) => {
        e.preventDefault();
        window.location.hash = "";
        window.location.reload();
    });
    try {
        board = loadBoardFromHash();

        if (board) {
            if (board.n.length === 1 && board.n[0][1] === "") {
                board.n[0][1] = "Complete!";
                selectedForAdd = 0;
            }
            renderBoard();
        }

        charCountIndicator.style.display = "flex";

        const padlockIcon = document.getElementById("padlockIcon");
        const passphraseModal = document.getElementById("passphraseModal");
        const passphraseDisplay = document.getElementById("passphraseDisplay");
        const closeModal = document.getElementById("closeModal");

        padlockIcon.addEventListener("click", function () {

            if (activePassphrase) {
                passphraseDisplay.value = activePassphrase;
                passphraseModal.style.display = "block";
            } else {
                activePassphrase = generatePassphrase();
                localStorage.setItem("passphrase", activePassphrase);
                encryptedByOwner = true;
                passphraseDisplay.value = activePassphrase;
                padlockIcon.innerHTML = LOCK_ICON + " Encrypted";
                saveBoardToHash(board);
            }
            passphraseModal.style.display = "block";
            setTimeout(() => {
                passphraseDisplay.focus();
                passphraseDisplay.select();
            }, 50)
        });

        closeModal.addEventListener("click", function () {
            passphraseModal.style.display = "none";
        });

        if (activePassphrase) {
            padlockIcon.innerHTML = LOCK_ICON + " Encrypted";
        } else {
            padlockIcon.innerHTML = UNLOCK_ICON + " Encrypt";
        }

        document.addEventListener("mousedown", function (e) {
            selectedForAdd = -1;
            inlineEditNode = -1;
            if (e.target.classList.contains("check-icon")) {
                const nodeIndex = parseInt(e.target.parentNode.dataset.nodeIdx)
                if (nodeIndex > 0) {
                    removeNode(nodeIndex);
                    saveBoardToHash(board);
                    renderBoard();
                } else {
                    window.location.hash = "";
                    alert('Congrats!')
                }
            } else if (e.target.className === 'node-box') {
                selectedForAdd = parseInt(e.target.dataset.nodeIdx);
                renderBoard();
            } else if (e.target.className === 'edit-icon') {
                renderBoard();
                startNodeInlineEditing(parseInt(e.target.parentNode.dataset.nodeIdx))
            } else {
                renderBoard();
            }
        });

        window.addEventListener("resize", renderBoard);
    } catch (ex) {
        document.body.innerHTML = "<p>Invalid board.</p>";
    }
}
window.addEventListener("load", init);