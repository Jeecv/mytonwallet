import React, { memo, useMemo } from '../../lib/teact/teact';
import { getActions, withGlobal } from '../../global';

import type { ApiDapp, ApiDappTransfer, ApiTokenWithPrice } from '../../api/types';
import type { Account } from '../../global/types';

import { TONCOIN } from '../../config';
import {
  selectCurrentDappTransferTotals,
  selectCurrentToncoinBalance,
  selectNetworkAccounts,
} from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { toBig, toDecimal } from '../../util/decimals';
import { formatCurrency } from '../../util/formatNumber';
import { shortenAddress } from '../../util/shortenAddress';
import { isNftTransferPayload, isTokenTransferPayload } from '../../util/ton/transfer';

import useCurrentOrPrev from '../../hooks/useCurrentOrPrev';
import useLang from '../../hooks/useLang';

import Button from '../ui/Button';
import DappAmountField from './DappAmountField';
import DappInfo from './DappInfo';
import DappTransfer from './DappTransfer';
import DappTransferFee from './DappTransferFee';

import modalStyles from '../ui/Modal.module.scss';
import styles from './Dapp.module.scss';

import scamImg from '../../assets/scam.svg';

interface OwnProps {
  onClose?: NoneToVoidFunction;
}

interface StateProps {
  currentAccount?: Account;
  toncoinBalance: bigint;
  transactions?: ApiDappTransfer[];
  totalAmountsBySlug: Record<string, bigint>;
  totalFullFee: bigint;
  totalReceived: bigint;
  isScam: boolean;
  isDangerous: boolean;
  nftCount: number;
  dapp?: ApiDapp;
  isLoading?: boolean;
  tokensBySlug: Record<string, ApiTokenWithPrice>;
}

interface SortedDappTransfer extends ApiDappTransfer {
  index: number;
  sortingCost: number;
}

const NFT_FAKE_COST_USD = 1_000_000_000;

function DappTransferInitial({
  currentAccount,
  toncoinBalance,
  transactions,
  totalAmountsBySlug,
  totalFullFee,
  totalReceived,
  isScam,
  isDangerous,
  nftCount,
  dapp,
  isLoading,
  tokensBySlug,
  onClose,
}: OwnProps & StateProps) {
  const { showDappTransfer, submitDappTransferConfirm } = getActions();

  const lang = useLang();
  const isSingleTransaction = transactions?.length === 1;
  const renderingTransactions = useCurrentOrPrev(transactions, true);
  const sortedTransactions = useMemo(
    () => sortTransactions(renderingTransactions, tokensBySlug),
    [renderingTransactions, tokensBySlug],
  );

  function renderDapp() {
    return (
      <div className={styles.transactionDirection}>
        <div className={styles.transactionAccount}>
          <div className={styles.accountTitle}>{currentAccount?.title}</div>
          <div className={styles.accountBalance}>{formatCurrency(toDecimal(toncoinBalance), TONCOIN.symbol)}</div>
        </div>

        <DappInfo
          iconUrl={dapp?.iconUrl}
          name={dapp?.name}
          url={dapp?.url}
          className={styles.transactionDapp}
        />
      </div>
    );
  }

  function renderTransaction() {
    return (
      <DappTransfer
        transaction={renderingTransactions![0]}
        tokensBySlug={tokensBySlug}
      />
    );
  }

  function renderTransactionRow(transaction: SortedDappTransfer) {
    const { payload } = transaction;

    let amountText = '';
    if (isNftTransferPayload(payload)) {
      amountText = '1 NFT';
    } else if (isTokenTransferPayload(payload)) {
      const { slug: tokenSlug, amount } = payload;
      const token = tokensBySlug[tokenSlug];
      if (token) {
        const { decimals, symbol } = token;
        amountText = formatCurrency(toDecimal(amount, decimals), symbol);
      }
    }
    if (!amountText || transaction.displayedAmount) {
      if (amountText) amountText += ' + ';
      amountText += formatCurrency(toDecimal(transaction.displayedAmount), TONCOIN.symbol);
    }

    return (
      <div
        key={transaction.index}
        className={styles.transactionRow}
        onClick={() => showDappTransfer({ transactionIdx: transaction.index })}
      >
        {transaction.isScam && <img src={scamImg} alt={lang('Scam')} className={styles.scamImage} />}
        <span className={buildClassName(styles.transactionRowAmount, transaction.isScam && styles.scam)}>
          {amountText}
        </span>
        {' '}
        <span className={buildClassName(styles.transactionRowAddress, transaction.isScam && styles.scam)}>
          {lang('$transaction_to', {
            address: shortenAddress(transaction.displayedToAddress),
          })}
        </span>
        <i className={buildClassName(styles.transactionRowChevron, 'icon-chevron-right')} aria-hidden />
      </div>
    );
  }

  function renderTransactions() {
    const hasAmount = nftCount > 0 || Object.keys(totalAmountsBySlug).length > 0;

    return (
      <>
        <p className={styles.label}>{lang('$many_transactions', renderingTransactions?.length, 'i')}</p>
        <div className={styles.transactionList}>
          {sortedTransactions?.map(renderTransactionRow)}
        </div>
        {hasAmount && (
          <DappAmountField label={lang('Total Amount')} amountsBySlug={totalAmountsBySlug} nftCount={nftCount} />
        )}
        {isDangerous && (
          <div className={styles.warningForPayload}>{lang('$hardware_payload_warning')}</div>
        )}
        <DappTransferFee fullFee={totalFullFee} received={totalReceived} />
      </>
    );
  }

  if (!renderingTransactions) {
    return undefined;
  }

  return (
    <div className={modalStyles.transitionContent}>
      {renderDapp()}
      {isSingleTransaction ? renderTransaction() : renderTransactions()}

      <div className={buildClassName(modalStyles.buttons, styles.buttonsAfterFee)}>
        <Button className={modalStyles.button} onClick={onClose}>{lang('Cancel')}</Button>
        <Button
          isPrimary
          isSubmit
          isLoading={isLoading}
          isDisabled={isScam}
          className={modalStyles.button}
          onClick={!isScam ? submitDappTransferConfirm : undefined}
        >
          {lang('Send')}
        </Button>
      </div>
    </div>
  );
}

export default memo(withGlobal<OwnProps>((global): StateProps => {
  const { isLoading, dapp, transactions } = global.currentDappTransfer;

  const accounts = selectNetworkAccounts(global);
  const {
    amountsBySlug: totalAmountsBySlug,
    isScam,
    isDangerous,
    fullFee: totalFullFee,
    received: totalReceived,
    nftCount,
  } = selectCurrentDappTransferTotals(global);

  return {
    currentAccount: accounts?.[global.currentAccountId!],
    toncoinBalance: selectCurrentToncoinBalance(global),
    transactions,
    totalAmountsBySlug,
    totalFullFee,
    totalReceived,
    isScam,
    isDangerous,
    nftCount,
    dapp,
    isLoading,
    tokensBySlug: global.tokenInfo.bySlug,
  };
})(DappTransferInitial));

function sortTransactions(
  transactions: readonly ApiDappTransfer[] | undefined,
  tokensBySlug: Record<string, ApiTokenWithPrice>,
) {
  if (!transactions) {
    return transactions;
  }

  return transactions
    .map((transaction, index): SortedDappTransfer => ({
      ...transaction,
      index,
      sortingCost: getTransactionCostForSorting(transaction, tokensBySlug),
    }))
    .sort((transaction0, transaction1) => transaction1.sortingCost - transaction0.sortingCost);
}

function getTransactionCostForSorting(transaction: ApiDappTransfer, tokensBySlug: Record<string, ApiTokenWithPrice>) {
  const tonAmount = toBig(transaction.displayedAmount + transaction.fullFee, TONCOIN.decimals).toNumber();
  let cost = tokensBySlug[TONCOIN.slug].quote.priceUsd * tonAmount;

  if (isTokenTransferPayload(transaction.payload)) {
    const { amount, slug } = transaction.payload;
    const token = tokensBySlug[slug];
    if (token) {
      cost += token.quote.priceUsd * toBig(amount, token.decimals).toNumber();
    }
  } else if (isNftTransferPayload(transaction.payload)) {
    // Simple way to display NFT at top of list
    cost += NFT_FAKE_COST_USD;
  }

  return cost;
}
