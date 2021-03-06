(function() {
    "use strict";

    angular.module("blocktrail.wallet")
        .controller("ReceiveCtrl", ReceiveCtrl);

    function ReceiveCtrl($scope, activeWallet, CurrencyConverter, $q, $cordovaClipboard, $cordovaEmailComposer,
                          $timeout, $btBackButtonDelegate, $translate, $cordovaSms, $log, $cordovaToast, CONFIG) {
        var walletData = activeWallet.getReadOnlyWalletData();

        $scope.networkLong = CONFIG.NETWORKS[walletData.networkType].NETWORK_LONG;
        $scope.address = null;
        $scope.path = null;
        $scope.bitcoinUri = null;
        $scope.qrcode = null;



        $scope.newRequest = {
            address: null,
            path: null,
            btcValue: 0,
            fiatValue: 0,
            message: null,
            bitcoinUri: ""
        };
        //control status of the app (allows for child scope modification)
        $scope.appControl = {
            working: false,
            showMessage: false,
            showRequestOptions: false
        };

        $scope.message = {};

        $scope.qrSettings = {
            correctionLevel: 7,
            SIZE: 225,
            inputMode: 'M',
            image: true
        };
        $scope.smsOptions = {
            replaceLineBreaks: false, // true to replace \n by a new line, false by default
            android: {
                intent: 'INTENT'  // send SMS with the native android SMS messaging
                //intent: '' // send SMS without open any other app
            }
        };

        $scope.swapInputs = function() {
            $scope.fiatFirst = !$scope.fiatFirst;
        };

        $scope.setFiat = function() {
            //converts and sets the FIAT value from the BTC value
            $scope.newRequest.fiatValue = parseFloat(CurrencyConverter.fromBTC($scope.newRequest.btcValue, $scope.settings.localCurrency, 2)) || 0;
            //$scope.newRequest.fiatValue.$setDirty();   //ideally set the other input to dirty as well
        };
        $scope.setBTC = function() {
            //converts and sets the BTC value from the FIAT value
            $scope.newRequest.btcValue = parseFloat(CurrencyConverter.toBTC($scope.newRequest.fiatValue, $scope.settings.localCurrency, 6)) || 0;
            //$scope.newRequest.btcValue.$setDirty();    //ideally set the other input to dirty as well
        };
        $scope.newAddress = function() {
            $q.when(activeWallet.getNewAddress()).then(function(address) {
                $scope.newRequest.address = address;
            });
        };

        $scope.generateQR = function() {
            if (!$scope.newRequest.address) {
                return false;
            }
            $scope.newRequest.bitcoinUri = "bitcoin:" + $scope.newRequest.address;
            if ($scope.newRequest.btcValue) {
                $scope.newRequest.bitcoinUri += "?amount=" + $scope.newRequest.btcValue.toFixed(8);
            }
        };

        $scope.showExportOptions = function() {
            $scope.appControl.showRequestOptions = true;
            $scope.appControl.showMessage = false;
            //set alternative back button function (just fires once)
            $btBackButtonDelegate.setBackButton(function() {
                $timeout(function() {
                    $scope.appControl.showRequestOptions = false;
                    $scope.appControl.showMessage = false;
                });
            }, true);
            $btBackButtonDelegate.setHardwareBackButton(function() {
                $timeout(function() {
                    $scope.appControl.showRequestOptions = false;
                    $scope.appControl.showMessage = false;
                });
            }, true);
        };

        $scope.hideExportOptions = function() {
            $scope.appControl.showRequestOptions = false;
            //reset back button functionality
            $btBackButtonDelegate.setBackButton($btBackButtonDelegate._default);
            $btBackButtonDelegate.setHardwareBackButton($btBackButtonDelegate._default);
        };

        $scope.showMessage = function() {
            $scope.appControl.showMessage = true;
            //set alternative back button function (just fires once)
            $btBackButtonDelegate.setBackButton(function() {
                $timeout(function() {
                    $scope.appControl.showMessage = false;
                });
            }, true);
            $btBackButtonDelegate.setHardwareBackButton(function() {
                $timeout(function() {
                    $scope.appControl.showMessage = false;
                });
            }, true);
        };

        $scope.dismissMessage = function() {
            $scope.appControl.showMessage = false;
            //reset back button functionality
            $btBackButtonDelegate.setBackButton($btBackButtonDelegate._default);
            $btBackButtonDelegate.setHardwareBackButton($btBackButtonDelegate._default);
        };

        $scope.toClipboard = function() {
            $cordovaClipboard.copy($scope.newRequest.address).then(function () {
                $cordovaToast.showShortCenter($translate.instant('MSG_ADDRESS_COPIED').sentenceCase())
                    .catch(function (err) {
                        console.error(err);
                    });
            }, function () {
                // error
                $scope.message = {title: 'Oops', body: 'unable to copy to clipboard'};
                $scope.showMessage();
            });
        };

        $scope.toEmail = function() {
            //get the QRCode
            var qrcode = document.querySelector('qr img');

            var params = {
                address: $scope.newRequest.address,
                addressURI: $scope.newRequest.bitcoinUri,
                btcValue: $scope.newRequest.btcValue,
                fiatValue: $scope.newRequest.fiatValue,
                localCurrency: $scope.settings.localCurrency,
                qrcode: qrcode.src
            };

            //launch email
            var options = {
                to: '',
                attachments: [
                    'base64:qrcode.png//' + qrcode.src.replace(/^data\:([^\;]+)\;base64,/gmi, '')
                ],
                subject: $scope.newRequest.btcValue ? $translate.instant('MSG_REQUEST_EMAIL_SUBJECT_2', params).sentenceCase() : $translate.instant('MSG_REQUEST_EMAIL_SUBJECT_1', params).sentenceCase(),
                body: $scope.newRequest.btcValue ? $translate.instant('MSG_REQUEST_EMAIL_BODY_2', params) : $translate.instant('MSG_REQUEST_EMAIL_BODY_1', params),
                isHtml: true
            };

            return $cordovaEmailComposer.open(options)
                .then(function() {
                    $log.debug('email success');
                    $scope.hideExportOptions();
                }, function() {
                    // user cancelled email
                    $log.error('email cancelled');
                    $scope.hideExportOptions();
                });
        };

        $scope.toSMS = function() {
            var params = {
                address: $scope.newRequest.address,
                btcValue: $scope.newRequest.btcValue,
                fiatValue: $scope.newRequest.fiatValue,
                localCurrency: $scope.settings.localCurrency
            };

            var smsMessage = $scope.newRequest.btcValue ? $translate.instant('MSG_REQUEST_SMS_2', params) : $translate.instant('MSG_REQUEST_SMS_1', params);

            return $cordovaSms.send('', smsMessage, $scope.smsOptions)
                .then(function() {
                    $scope.hideExportOptions();
                })
                .catch(function(err) {
                    // An error occurred
                    $log.error(err);
                });
        };

        // update the URI and QR code when address or value change
        $scope.$watchGroup(['newRequest.btcValue', 'newRequest.address'], function(newValues, oldValues) {
            if (oldValues != newValues) {
                //ignore call from scope initialisation
                $scope.generateQR();
            }
        });

        // generate the first address
        $scope.newAddress();
    }
})();
