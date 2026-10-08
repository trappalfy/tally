#!/bin/sh
# Deploy TallyHub and open the current series. Usage: ./deploy.sh mainnet|testnet
set -e
cd "$(dirname "$0")"
NET=${1:-mainnet}
set -a; . ../.env; set +a
# empty role vars fall back to the deployer inside the script
[ -z "$OWNER_SAFE" ] && unset OWNER_SAFE
[ -z "$ARBITER_SAFE" ] && unset ARBITER_SAFE
[ -z "$TREASURY" ] && unset TREASURY
if [ "$NET" = "mainnet" ]; then RPC=${RPC_MAINNET:-https://rpc.mainnet.chain.robinhood.com}; CHAIN=4663; EXPL=https://robinhoodchain.blockscout.com/api/;
else RPC=${RPC_TESTNET:-https://rpc.testnet.chain.robinhood.com}; CHAIN=46630; EXPL=https://explorer.testnet.chain.robinhood.com/api/; fi
export PATH="$HOME/.foundry/bin:$PATH"
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --disable-code-size-limit --slow
HUB=$(jq -r '[.transactions[] | select(.contractName=="TallyHub")][0].contractAddress' broadcast/Deploy.s.sol/$CHAIN/run-latest.json)
BLOCK=$(jq -r '.receipts[0].blockNumber' broadcast/Deploy.s.sol/$CHAIN/run-latest.json)
echo "HUB=$HUB BLOCK=$BLOCK"
cat > ../web/.env.local <<EOT
NEXT_PUBLIC_CHAIN_ID=$CHAIN
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_HUB_ADDRESS=$HUB
NEXT_PUBLIC_HUB_FROM_BLOCK=$(printf "%d" $BLOCK)
NEXT_PUBLIC_USDG_ADDRESS=${USDG_ADDRESS}
NEXT_PUBLIC_X_HANDLE=${NEXT_PUBLIC_X_HANDLE}
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
EOT
# source verification (best effort)
forge verify-contract "$HUB" src/TallyHub.sol:TallyHub --chain-id $CHAIN --verifier blockscout --verifier-url "$EXPL" --rpc-url "$RPC" --guess-constructor-args --watch || true
forge verify-contract "$HUB" src/TallyHub.sol:TallyHub --chain-id $CHAIN --verifier sourcify --rpc-url "$RPC" --guess-constructor-args || true
