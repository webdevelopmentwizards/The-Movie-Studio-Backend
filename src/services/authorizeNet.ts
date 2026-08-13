import { AUTHORIZENET } from '../config/globals';
import { BadRequestError, InternalError } from '../core/ApiError';
import Logger from '../core/Logger';

const AuthorizeNet = require('authorizenet');
const ApiContracts = AuthorizeNet.APIContracts;
const ApiControllers = AuthorizeNet.APIControllers;
const SDKConstants = AuthorizeNet.Constants;

export type OpaquePaymentData = {
  dataDescriptor: string;
  dataValue: string;
};

export type ChargeResult = {
  transactionId: string;
  authCode: string | null;
  accountNumber: string | null;
  accountType: string | null;
};

function isSandbox(): boolean {
  return String(AUTHORIZENET.env).toLowerCase() !== 'production';
}

export function chargeOpaqueData(params: {
  amount: number;
  opaqueData: OpaquePaymentData;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  invoiceNumber?: string;
  description?: string;
}): Promise<ChargeResult> {
  if (!AUTHORIZENET.apiLoginId || !AUTHORIZENET.transactionKey) {
    throw new InternalError('Payment is not configured.');
  }
  if (!params.opaqueData?.dataDescriptor || !params.opaqueData?.dataValue) {
    throw new BadRequestError('Payment token is required.');
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new InternalError('Invalid membership amount.');
  }

  return new Promise((resolve, reject) => {
    const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(AUTHORIZENET.apiLoginId);
    merchantAuthenticationType.setTransactionKey(AUTHORIZENET.transactionKey);

    const opaqueData = new ApiContracts.OpaqueDataType();
    opaqueData.setDataDescriptor(params.opaqueData.dataDescriptor);
    opaqueData.setDataValue(params.opaqueData.dataValue);

    const paymentType = new ApiContracts.PaymentType();
    paymentType.setOpaqueData(opaqueData);

    const customer = new ApiContracts.CustomerDataType();
    customer.setEmail(params.email);

    const billTo = new ApiContracts.CustomerAddressType();
    if (params.firstName) billTo.setFirstName(params.firstName);
    if (params.lastName) billTo.setLastName(params.lastName);
    billTo.setEmail(params.email);

    const transactionRequestType = new ApiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(
      ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION,
    );
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setAmount(params.amount.toFixed(2));
    transactionRequestType.setCustomer(customer);
    transactionRequestType.setBillTo(billTo);
    const orderDetails = new ApiContracts.OrderType();
    if (params.invoiceNumber) orderDetails.setInvoiceNumber(params.invoiceNumber);
    orderDetails.setDescription(params.description || 'The Movie Studio membership');
    transactionRequestType.setOrder(orderDetails);

    const createRequest = new ApiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);

    const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
    ctrl.setEnvironment(isSandbox() ? SDKConstants.endpoint.sandbox : SDKConstants.endpoint.production);

    ctrl.execute(() => {
      try {
        const apiResponse = ctrl.getResponse();
        const response = new ApiContracts.CreateTransactionResponse(apiResponse);

        if (response.getMessages().getResultCode() !== ApiContracts.MessageTypeEnum.OK) {
          const message =
            response.getMessages()?.getMessage()?.[0]?.getText() || 'Payment could not be processed.';
          Logger.error(`Authorize.net failed: ${message}`);
          reject(new BadRequestError(message));
          return;
        }

        const txn = response.getTransactionResponse();
        if (!txn || txn.getResponseCode() !== '1') {
          const errors = txn?.getErrors?.()?.getError?.();
          const message = errors?.[0]?.getErrorText?.() || 'Your card was declined.';
          Logger.error(`Authorize.net declined: ${message}`);
          reject(new BadRequestError(message));
          return;
        }

        resolve({
          transactionId: String(txn.getTransId()),
          authCode: txn.getAuthCode() ? String(txn.getAuthCode()) : null,
          accountNumber: txn.getAccountNumber() ? String(txn.getAccountNumber()) : null,
          accountType: txn.getAccountType() ? String(txn.getAccountType()) : null,
        });
      } catch (error) {
        Logger.error(`Authorize.net error: ${error instanceof Error ? error.message : error}`);
        reject(new InternalError('Payment could not be processed. Please try again.'));
      }
    });
  });
}
